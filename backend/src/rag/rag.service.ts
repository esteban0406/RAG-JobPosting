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
  ): Promise<{ prompt: string; sources: JobSource[] } | null> {
    // When specific jobs are provided, skip embedding and vector search entirely
    if (contextJobIds && contextJobIds.length > 0) {
      return this.buildContextFromIds(contextJobIds, userQuery, userId);
    }

    const t0 = Date.now();
    const [resumeEmbedding, resumeParsed] = userId
      ? await Promise.all([
          this.resumeService.getEmbedding(userId),
          this.resumeService.getParsedData(userId),
        ])
      : [null, null];

    const queryVector =
      resumeEmbedding ?? (await this.embeddingService.embedQuery(userQuery));
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

    const contextChunks = topJobs
      .map((group) => {
        const job = jobMap.get(group.jobId);
        if (!job) return null;
        const location = job.location ? ` | Location: ${job.location}` : '';
        const jobType = job.jobType ? ` | Type: ${job.jobType}` : '';
        const similarity = group.maxSimilarity.toFixed(2);
        const header = `Job: ${job.title} at ${job.company}${location}${jobType} | Similarity: ${similarity}`;
        const body = group.mergedText.slice(0, MAX_JOB_CONTEXT_CHARS);
        return `---\n${header}\n${body}`;
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

    return { prompt, sources };
  }

  private async buildContextFromIds(
    contextJobIds: string[],
    userQuery: string,
    userId?: string,
  ): Promise<{ prompt: string; sources: JobSource[] } | null> {
    const t0 = Date.now();

    const [[resumeEmbedding, resumeParsed], jobs] = await Promise.all([
      userId
        ? Promise.all([
            this.resumeService.getEmbedding(userId),
            this.resumeService.getParsedData(userId),
          ])
        : Promise.resolve([null, null] as [null, null]),
      this.jobRepo.findByIds(contextJobIds),
    ]);

    if (jobs.length === 0) return null;

    const queryVector =
      resumeEmbedding ?? (await this.embeddingService.embedQuery(userQuery));

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

    const contextChunks = ranked
      .map(({ jobId, maxSimilarity }) => {
        const job = jobMap.get(jobId);
        if (!job) return null;
        const location = job.location ? ` | Location: ${job.location}` : '';
        const jobType = job.jobType ? ` | Type: ${job.jobType}` : '';
        const body = job.description?.slice(0, MAX_JOB_CONTEXT_CHARS) ?? '';
        return `---\nJob: ${job.title} at ${job.company}${location}${jobType} | Similarity: ${maxSimilarity.toFixed(2)}\n${body}`;
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

    return { prompt, sources };
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
