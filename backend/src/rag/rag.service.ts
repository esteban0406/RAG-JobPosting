import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { LlmService } from '../llm/llm.service.js';
import type { ParsedResume } from '../resume/interfaces/parsed-resume.interface.js';
import { ResumeService } from '../resume/resume.service.js';
import { JobRepository } from '../storage/job.repository.js';
import {
  JobChunkResult,
  VectorRepository,
} from '../storage/vector.repository.js';
import { JobSource, RagResponse } from './dto/rag-response.dto.js';

const RETRIEVAL_K = 15;
const RESULT_JOBS = 5;
const SIMILARITY_THRESHOLD = 0.5;
const MAX_JOB_CONTEXT_CHARS = 2400;

const FIELD_PATTERNS: Array<[RegExp, string]> = [
  [/\b(salary|pay|compensation|wage|earning)/i, 'salary'],
  [/\b(benefit|perk|pto|vacation|insurance|401)/i, 'benefits'],
  [
    /\b(requirement|qualification|experience|degree|background)/i,
    'requirements',
  ],
  [/\b(skill|tech stack|language|framework|tool)/i, 'skills'],
  [/\b(responsibilit|dut)/i, 'responsibilities'],
];

function detectFields(query: string): Set<string> {
  const fields = new Set<string>();
  for (const [pattern, field] of FIELD_PATTERNS) {
    if (pattern.test(query)) fields.add(field);
  }
  return fields;
}

function buildFieldAppendix(
  job: {
    requirements: string[];
    responsibilities: string[];
    benefits: string[];
    skills: string[];
  },
  requiredFields: Set<string>,
  existingText: string,
): string {
  const lines: string[] = [];
  const append = (chunkType: string, values: string[]): void => {
    if (
      requiredFields.has(chunkType) &&
      values.length > 0 &&
      !existingText.includes(`[${chunkType}]:`)
    ) {
      lines.push(`[${chunkType}]: ${values.join(', ')}`);
    }
  };
  append('requirements', job.requirements);
  append('responsibilities', job.responsibilities);
  append('benefits', job.benefits);
  append('skills', job.skills);
  return lines.length > 0 ? '\n' + lines.join('\n') : '';
}

function salaryHeader(
  minSalary: number | null,
  maxSalary: number | null,
): string {
  if (!minSalary) return '';
  const max = maxSalary ? `–$${maxSalary.toLocaleString()}` : '+';
  return ` | Salary: $${minSalary.toLocaleString()}${max}`;
}

export interface QueryFilters {
  location?: string;
  jobType?: string;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorRepo: VectorRepository,
    private readonly jobRepo: JobRepository,
    private readonly llmService: LlmService,
    private readonly resumeService: ResumeService,
  ) {}

  async query(
    userQuery: string,
    filters?: QueryFilters,
    contextJobIds?: string[],
    userId?: string,
  ): Promise<RagResponse> {
    const ctx = await this.buildContext(
      userQuery,
      filters,
      contextJobIds,
      userId,
    );
    if (!ctx) {
      return {
        answer:
          'No relevant job postings found for your query. Try different keywords or broaden your search.',
        sources: [],
        retrievedAt: new Date(),
      };
    }
    const answer = await this.llmService.complete(ctx.prompt);
    return { answer, sources: ctx.sources, retrievedAt: new Date() };
  }

  async *queryStream(
    userQuery: string,
    filters?: QueryFilters,
    contextJobIds?: string[],
    userId?: string,
  ): AsyncGenerator<string | { done: true; sources: JobSource[] }> {
    const t0 = Date.now();
    const ctx = await this.buildContext(
      userQuery,
      filters,
      contextJobIds,
      userId,
    );
    this.logger.debug(`buildContext took ${Date.now() - t0}ms`);

    if (!ctx) {
      yield 'No relevant job postings found for your query. Try different keywords or broaden your search.';
      yield { done: true, sources: [] };
      return;
    }

    const t1 = Date.now();
    yield* this.llmService.completeStream(ctx.prompt);
    this.logger.debug(`LLM stream took ${Date.now() - t1}ms`);

    yield { done: true, sources: ctx.sources };
  }

  async buildContext(
    userQuery: string,
    _filters?: QueryFilters,
    contextJobIds?: string[],
    userId?: string,
  ): Promise<{
    prompt: string;
    sources: JobSource[];
    contextChunks: string;
  } | null> {
    // When specific jobs are provided, skip embedding and vector search entirely
    if (contextJobIds && contextJobIds.length > 0) {
      return this.buildContextFromIds(contextJobIds, userQuery, userId);
    }

    const t0 = Date.now();
    const resumeParsed = userId
      ? await this.resumeService.getParsedData(userId)
      : null;

    const searchQuery = resumeParsed
      ? this.buildResumeSearchQuery(resumeParsed, userQuery)
      : userQuery;

    const queryVector = await this.embeddingService.embedQuery(searchQuery);
    this.logger.debug(`Embedding took ${Date.now() - t0}ms`);

    const t1 = Date.now();
    const rawChunks = await this.vectorRepo.findSimilar(
      queryVector,
      RETRIEVAL_K,
      SIMILARITY_THRESHOLD,
    );
    this.logger.debug(
      `Vector search took ${Date.now() - t1}ms — ${rawChunks.length} chunks (threshold=${SIMILARITY_THRESHOLD})`,
    );

    if (rawChunks.length === 0) return null;

    const grouped = this.groupByJob(rawChunks);
    const topJobs = grouped.slice(0, RESULT_JOBS);

    const t2 = Date.now();
    const jobIds = topJobs.map((g) => g.jobId);
    const jobs = await this.jobRepo.findByIds(jobIds);
    this.logger.debug(`Job fetch took ${Date.now() - t2}ms`);
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const requiredFields = detectFields(userQuery);
    const contextChunks = topJobs
      .map((group) => {
        const job = jobMap.get(group.jobId);
        if (!job) return null;
        const location = job.location ? ` | Location: ${job.location}` : '';
        const jobType = job.jobType ? ` | Type: ${job.jobType}` : '';
        const salary = salaryHeader(
          job.minSalary ?? null,
          job.maxSalary ?? null,
        );
        const similarity = group.maxSimilarity.toFixed(2);
        const header = `Job: ${job.title} at ${job.company}${location}${jobType}${salary} | Similarity: ${similarity}`;
        const body = group.mergedText.slice(0, MAX_JOB_CONTEXT_CHARS);
        const appendix = buildFieldAppendix(job, requiredFields, body);
        return `---\n${header}\n${body}${appendix}`;
      })
      .filter((c): c is string => c !== null)
      .join('\n\n');

    const userProfileContext = resumeParsed
      ? this.buildUserProfileContext(resumeParsed)
      : '';
    const prompt = this.buildPrompt(
      userQuery,
      contextChunks,
      userProfileContext,
    );

    const sources: JobSource[] = topJobs
      .map((group) => {
        const job = jobMap.get(group.jobId);
        if (!job) return null;
        return {
          jobId: job.id,
          title: job.title,
          company: job.company,
          url: job.url,
          similarity: Math.round(group.maxSimilarity * 100) / 100,
        };
      })
      .filter((s): s is JobSource => s !== null);

    return { prompt, sources, contextChunks };
  }

  private async buildContextFromIds(
    contextJobIds: string[],
    userQuery: string,
    userId?: string,
  ): Promise<{
    prompt: string;
    sources: JobSource[];
    contextChunks: string;
  } | null> {
    const t0 = Date.now();

    const [resumeParsed, jobs] = await Promise.all([
      userId ? this.resumeService.getParsedData(userId) : Promise.resolve(null),
      this.jobRepo.findByIds(contextJobIds),
    ]);

    if (jobs.length === 0) return null;

    const searchQuery = resumeParsed
      ? this.buildResumeSearchQuery(resumeParsed, userQuery)
      : userQuery;

    const queryVector = await this.embeddingService.embedQuery(searchQuery);

    const chunks = await this.vectorRepo.findSimilarByJobIds(
      queryVector,
      contextJobIds,
    );
    this.logger.debug(
      `Context jobs fetch + similarity took ${Date.now() - t0}ms`,
    );

    const jobMap = new Map(jobs.map((j) => [j.id, j]));
    const grouped = this.groupByJob(chunks);

    const ranked = contextJobIds
      .map((id) => {
        const g = grouped.find((gr) => gr.jobId === id);
        return { jobId: id, maxSimilarity: g?.maxSimilarity ?? 0 };
      })
      .sort((a, b) => b.maxSimilarity - a.maxSimilarity);

    const requiredFields = detectFields(userQuery);
    const contextChunks = ranked
      .map(({ jobId, maxSimilarity }) => {
        const job = jobMap.get(jobId);
        if (!job) return null;
        const location = job.location ? ` | Location: ${job.location}` : '';
        const jobType = job.jobType ? ` | Type: ${job.jobType}` : '';
        const salary = salaryHeader(
          job.minSalary ?? null,
          job.maxSalary ?? null,
        );
        const body = job.description?.slice(0, MAX_JOB_CONTEXT_CHARS) ?? '';
        const appendix = buildFieldAppendix(job, requiredFields, body);
        return `---\nJob: ${job.title} at ${job.company}${location}${jobType}${salary} | Similarity: ${maxSimilarity.toFixed(2)}\n${body}${appendix}`;
      })
      .filter((c): c is string => c !== null)
      .join('\n\n');

    const userProfileContext = resumeParsed
      ? this.buildUserProfileContext(resumeParsed)
      : '';
    const prompt = this.buildPrompt(
      userQuery,
      contextChunks,
      userProfileContext,
    );

    const sources: JobSource[] = ranked
      .map(({ jobId, maxSimilarity }) => {
        const job = jobMap.get(jobId);
        if (!job) return null;
        return {
          jobId: job.id,
          title: job.title,
          company: job.company,
          url: job.url,
          similarity: Math.round(maxSimilarity * 100) / 100,
        };
      })
      .filter((s): s is JobSource => s !== null);

    return { prompt, sources, contextChunks };
  }

  private groupByJob(chunks: JobChunkResult[]): Array<{
    jobId: string;
    maxSimilarity: number;
    mergedText: string;
  }> {
    const map = new Map<
      string,
      { maxSimilarity: number; chunks: JobChunkResult[] }
    >();

    for (const chunk of chunks) {
      const existing = map.get(chunk.jobId);
      if (!existing) {
        map.set(chunk.jobId, {
          maxSimilarity: chunk.similarity,
          chunks: [chunk],
        });
      } else {
        if (chunk.similarity > existing.maxSimilarity) {
          existing.maxSimilarity = chunk.similarity;
        }
        existing.chunks.push(chunk);
      }
    }

    return Array.from(map.entries())
      .map(([jobId, { maxSimilarity, chunks }]) => ({
        jobId,
        maxSimilarity,
        mergedText: chunks
          .sort((a, b) => b.similarity - a.similarity)
          .map((c) => `[${c.chunkType}]: ${c.chunkText}`)
          .join('\n\n'),
      }))
      .sort((a, b) => b.maxSimilarity - a.maxSimilarity);
  }

  private buildResumeSearchQuery(
    resume: ParsedResume,
    fallbackQuery: string,
  ): string {
    const titles = resume.experience
      .slice(0, 3)
      .map((e) => e.title)
      .filter(Boolean);
    const skills = resume.skills.slice(0, 15);

    const parts: string[] = [];
    if (titles.length > 0) parts.push(titles.join(' '));
    if (skills.length > 0) parts.push(skills.join(' '));

    return parts.length > 0 ? parts.join(' ') : fallbackQuery;
  }

  private buildPrompt(
    query: string,
    context: string,
    userProfileContext = '',
  ): string {
    return `You are a helpful job search assistant. Answer the user's query based ONLY on the job postings provided below.
Be concise and specific. If the postings don't contain relevant information, say so clearly. Do not fabricate details.

${userProfileContext}Job Postings:
${context}

User Query: ${query}

Answer:`;
  }

  private buildUserProfileContext(resume: ParsedResume): string {
    const lines: string[] = [];

    if (resume.name) lines.push(`  Name: ${resume.name}`);
    if (resume.summary) lines.push(`  Summary: ${resume.summary}`);
    if (resume.skills.length > 0)
      lines.push(`  Skills: ${resume.skills.join(', ')}`);
    if (resume.experience.length > 0) {
      const exp = resume.experience
        .slice(0, 3)
        .map(
          (e) =>
            `${e.title} at ${e.company}${e.startDate ? ` (${e.startDate}–${e.endDate ?? 'Present'})` : ''}`,
        )
        .join('; ');
      lines.push(`  Experience: ${exp}`);
    }
    if (resume.location) lines.push(`  Location: ${resume.location}`);

    if (lines.length === 0) return '';
    return `User Profile:\n${lines.join('\n')}\n\n`;
  }
}
