import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import PQueue from 'p-queue';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { JobRepository } from '../storage/job.repository.js';
import { VectorRepository } from '../storage/vector.repository.js';
import { AdzunaProvider } from './providers/adzuna.provider.js';
import { RemotiveProvider } from './providers/remotive.provider.js';
import { WebNinjaProvider } from './providers/webninja.provider.js';
import { JobicyProvider } from './providers/jobicy.provider.js';
import { CareerjetProvider } from './providers/careerjet.provider.js';
import { JobProvider, RawJobDto } from './dto/raw-job.dto.js';

const MAX_DESCRIPTION_CHARS = 2000;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private isRunning = false;
  private readonly queue: PQueue;
  private readonly providers: JobProvider[];

  constructor(
    adzuna: AdzunaProvider,
    remotive: RemotiveProvider,
    webninja: WebNinjaProvider,
    jobicy: JobicyProvider,
    careerjet: CareerjetProvider,
    private readonly jobRepo: JobRepository,
    private readonly vectorRepo: VectorRepository,
    private readonly embeddingService: EmbeddingService,
  ) {
    this.providers = [remotive, webninja, jobicy, adzuna];
    const isGemini = embeddingService.provider === 'gemini';
    // Local model: no rate limits, run concurrently. Gemini: 30 RPM (2s interval)
    this.queue = new PQueue(
      isGemini
        ? { concurrency: 1, interval: 2000, intervalCap: 1 }
        : { concurrency: 5 },
    );
  }

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

      for (const provider of this.providers) {
        const providerName = provider.constructor.name;
        let jobs: RawJobDto[];
        try {
          jobs = await this.fetchAllPages(provider);
        } catch (err) {
          this.logger.error(
            `Provider ${providerName} failed, skipping: ${(err as Error).message}`,
          );
          continue;
        }
        fetched += jobs.length;
        this.logger.log(`Fetched ${jobs.length} jobs from ${providerName}`);

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
            void this.queue.add(async () => {
              try {
                const chunkText = this.buildChunkText(raw);
                const embedding = await this.embeddingService.embed(chunkText);
                await this.vectorRepo.upsertChunk(
                  jobToEmbed.id,
                  chunkText,
                  embedding,
                  this.embeddingService.modelName,
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

          void this.queue.add(async () => {
            try {
              const chunkText = this.buildChunkText(raw);
              const embedding = await this.embeddingService.embed(chunkText);
              await this.vectorRepo.upsertChunk(
                job.id,
                chunkText,
                embedding,
                this.embeddingService.modelName,
              );
              this.logger.debug(`Embedded job: ${job.title} (${job.company})`);
            } catch (err) {
              this.logger.error(
                `Failed to embed job ${job.id}: ${(err as Error).message}`,
              );
            }
          });
        }
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

  private async fetchAllPages(provider: JobProvider): Promise<RawJobDto[]> {
    const all: RawJobDto[] = [];
    let page = 1;

    while (true) {
      const results = await provider.fetchJobs(page);
      all.push(...results);
      if (!provider.hasNextPage(page, results)) break;
      page++;
    }

    return all;
  }

  private hashJob(job: RawJobDto): string {
    const content = `${job.title}|${job.company}|${job.description}|${job.location ?? ''}`;
    return createHash('sha256').update(content).digest('hex');
  }

  async exportToCsv(): Promise<{ csv: string; count: number }> {
    const jobs = await this.jobRepo.findAll();
    const headers = [
      'id',
      'sourceId',
      'source',
      'title',
      'company',
      'location',
      'description',
      'url',
      'jobType',
      'minSalary',
      'maxSalary',
      'fetchedAt',
      'createdAt',
    ];
    const escape = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = jobs.map((j) =>
      headers.map((h) => escape(j[h as keyof typeof j])).join(','),
    );
    return { csv: [headers.join(','), ...rows].join('\n'), count: jobs.length };
  }

  private buildChunkText(job: RawJobDto): string {
    const desc = job.description.slice(0, MAX_DESCRIPTION_CHARS);
    return `${job.title} — ${job.company} — ${desc}`;
  }
}
