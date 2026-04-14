import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { LlmService } from '../llm/llm.service.js';
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
  ) {}

  async query(
    userQuery: string,
    filters?: QueryFilters,
    contextJobIds?: string[],
  ): Promise<RagResponse> {
    const queryVector = await this.embeddingService.embedQuery(userQuery);

    const rawChunks = await this.vectorRepo.findSimilar(
      queryVector,
      RETRIEVAL_K,
      SIMILARITY_THRESHOLD,
    );

    this.logger.debug(
      `Retrieved ${rawChunks.length} raw chunks (threshold=${SIMILARITY_THRESHOLD})`,
    );

    if (rawChunks.length === 0) {
      return {
        answer:
          'No relevant job postings found for your query. Try different keywords or broaden your search.',
        sources: [],
        retrievedAt: new Date(),
      };
    }

    const grouped = this.groupByJob(rawChunks);
    const topJobs = grouped.slice(0, RESULT_JOBS);

    const jobIds = topJobs.map((g) => g.jobId);
    const jobs = await this.jobRepo.findByIds(jobIds);
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

    const savedJobsContext = await this.buildSavedJobsContext(contextJobIds);
    const prompt = this.buildPrompt(userQuery, contextChunks, savedJobsContext);
    const answer = await this.llmService.complete(prompt);

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

    return { answer, sources, retrievedAt: new Date() };
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

  private async buildSavedJobsContext(
    contextJobIds?: string[],
  ): Promise<string> {
    if (!contextJobIds || contextJobIds.length === 0) return '';
    const jobs = await this.jobRepo.findByIds(contextJobIds);
    if (jobs.length === 0) return '';
    const lines = jobs
      .map((job, i) => {
        const location = job.location ? ` — ${job.location}` : '';
        const desc = job.description
          ? `\n   Description: ${job.description.slice(0, 600)}`
          : '';
        return `${i + 1}. [${job.title} @ ${job.company}${location}]${desc}`;
      })
      .join('\n');
    return `The user is asking about the following saved jobs:\n${lines}\n\nAnswer the user's question in relation to these jobs when relevant.\n\n`;
  }

  private buildPrompt(
    query: string,
    context: string,
    savedJobsContext = '',
  ): string {
    return `You are a helpful job search assistant. Answer the user's query based ONLY on the job postings provided below.
Be concise and specific. If the postings don't contain relevant information, say so clearly. Do not fabricate details.

${savedJobsContext}Job Postings:
${context}

User Query: ${query}

Answer:`;
  }
}
