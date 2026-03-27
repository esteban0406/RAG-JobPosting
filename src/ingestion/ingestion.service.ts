import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import PQueue from 'p-queue';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { JobRepository } from '../storage/job.repository.js';
import { VectorRepository } from '../storage/vector.repository.js';
import { ArbeitnowProvider } from './providers/arbeitnow.provider.js';
import { RawJobDto } from './dto/raw-job.dto.js';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const MAX_DESCRIPTION_CHARS = 2000;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private isRunning = false;
  // 1 task per 2 seconds = 30 RPM — safely within the free tier 100 RPM limit
  private readonly queue = new PQueue({
    concurrency: 1,
    interval: 2000,
    intervalCap: 1,
  });

  constructor(
    private readonly arbeitnow: ArbeitnowProvider,
    private readonly jobRepo: JobRepository,
    private readonly vectorRepo: VectorRepository,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async run(): Promise<{ fetched: number; stored: number; skipped: number }> {
    if (this.isRunning) {
      this.logger.warn('Ingestion already running, skipping');
      return { fetched: 0, stored: 0, skipped: 0 };
    }

    this.isRunning = true;
    let fetched = 0;
    let stored = 0;
    let skipped = 0;

    try {
      this.logger.log('Starting ingestion run');
      const jobs = await this.fetchAllPages();
      fetched = jobs.length;
      this.logger.log(`Fetched ${fetched} jobs from Arbeitnow`);

      for (const raw of jobs) {
        const contentHash = this.hashJob(raw);
        const existing = await this.jobRepo.findByContentHash(contentHash);

        if (existing) {
          const alreadyEmbedded = await this.vectorRepo.hasEmbedding(
            existing.id,
          );
          if (alreadyEmbedded) {
            skipped++;
            continue;
          }
          // Job exists but has no embedding — re-enqueue for embedding only
          const jobToEmbed = existing;
          this.queue.add(async () => {
            try {
              const chunkText = this.buildChunkText(raw);
              const embedding = await this.embeddingService.embed(chunkText);
              await this.vectorRepo.upsertChunk(
                jobToEmbed.id,
                chunkText,
                embedding,
                EMBEDDING_MODEL,
              );
              this.logger.debug(
                `Re-embedded job: ${jobToEmbed.title} (${jobToEmbed.company})`,
              );
            } catch (err) {
              this.logger.error(
                `Failed to embed job ${jobToEmbed.id}: ${(err as Error).message}`,
              );
            }
          });
          continue;
        }

        const job = await this.jobRepo.upsertJob({ ...raw, contentHash });
        stored++;

        this.queue.add(async () => {
          try {
            const chunkText = this.buildChunkText(raw);
            const embedding = await this.embeddingService.embed(chunkText);
            await this.vectorRepo.upsertChunk(
              job.id,
              chunkText,
              embedding,
              EMBEDDING_MODEL,
            );
            this.logger.debug(`Embedded job: ${job.title} (${job.company})`);
          } catch (err) {
            this.logger.error(
              `Failed to embed job ${job.id}: ${(err as Error).message}`,
            );
          }
        });
      }

      await this.queue.onIdle();
      this.logger.log(
        `Ingestion complete — fetched=${fetched} stored=${stored} skipped=${skipped}`,
      );
    } finally {
      this.isRunning = false;
    }

    return { fetched, stored, skipped };
  }

  private async fetchAllPages(): Promise<RawJobDto[]> {
    const all: RawJobDto[] = [];
    let page = 1;

    while (true) {
      const results = await this.arbeitnow.fetchJobs(page);
      if (!this.arbeitnow.hasNextPage(page, results)) break;
      all.push(...results);
      page++;
    }

    return all;
  }

  private hashJob(job: RawJobDto): string {
    const content = `${job.title}|${job.company}|${job.description}|${job.location ?? ''}`;
    return createHash('sha256').update(content).digest('hex');
  }

  private buildChunkText(job: RawJobDto): string {
    const desc = job.description.slice(0, MAX_DESCRIPTION_CHARS);
    return `${job.title} — ${job.company} — ${desc}`;
  }
}
