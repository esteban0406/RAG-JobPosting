import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { LlmService } from '../llm/llm.service.js';
import { JobRepository } from '../storage/job.repository.js';
import { VectorRepository } from '../storage/vector.repository.js';
import { JobSource, RagResponse } from './dto/rag-response.dto.js';

const TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.5;
const MAX_CHUNK_TOKENS = 600;
const MAX_CONTEXT_CHUNKS = 5;

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

  async query(userQuery: string, filters?: QueryFilters): Promise<RagResponse> {
    const queryVector = await this.embeddingService.embedQuery(userQuery);

    const chunks = await this.vectorRepo.findSimilar(
      queryVector,
      TOP_K,
      SIMILARITY_THRESHOLD,
    );

    this.logger.debug(
      `Retrieved ${chunks.length} chunks for query (threshold=${SIMILARITY_THRESHOLD})`,
    );

    if (chunks.length === 0) {
      return {
        answer:
          'No relevant job postings found for your query. Try different keywords or broaden your search.',
        sources: [],
        retrievedAt: new Date(),
      };
    }

    const jobs = await this.jobRepo.findAll(filters);
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const contextChunks = chunks
      .slice(0, MAX_CONTEXT_CHUNKS)
      .map((chunk) => {
        const job = jobMap.get(chunk.jobId);
        const truncated = chunk.chunkText.slice(0, MAX_CHUNK_TOKENS * 4);
        const location = job?.location ? ` | Location: ${job.location}` : '';
        const jobType = job?.jobType ? ` | Type: ${job.jobType}` : '';
        return `---\nJob: ${job?.title ?? 'Unknown'} at ${job?.company ?? 'Unknown'}${location}${jobType}\n${truncated}`;
      })
      .join('\n\n');

    const prompt = this.buildPrompt(userQuery, contextChunks);
    const answer = await this.llmService.complete(prompt);

    const sources: JobSource[] = chunks
      .map((chunk) => {
        const job = jobMap.get(chunk.jobId);
        if (!job) return null;
        return {
          jobId: job.id,
          title: job.title,
          company: job.company,
          url: job.url,
          similarity: Math.round(chunk.similarity * 100) / 100,
        };
      })
      .filter((s): s is JobSource => s !== null);

    return { answer, sources, retrievedAt: new Date() };
  }

  private buildPrompt(query: string, context: string): string {
    return `You are a helpful job search assistant. Answer the user's query based ONLY on the job postings provided below.
Be concise and specific. If the postings don't contain relevant information, say so clearly. Do not fabricate details.

Job Postings:
${context}

User Query: ${query}

Answer:`;
  }
}
