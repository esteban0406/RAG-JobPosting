import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import PQueue from 'p-queue';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { JobRepository } from '../storage/job.repository.js';
import { VectorRepository } from '../storage/vector.repository.js';
import { PrismaService } from '../storage/prisma.service.js';
import { AdzunaProvider } from './providers/adzuna.provider.js';
import { RemotiveProvider } from './providers/remotive.provider.js';
import { WebNinjaProvider } from './providers/webninja.provider.js';
import { JobicyProvider } from './providers/jobicy.provider.js';
import { CareerjetProvider } from './providers/careerjet.provider.js';
import { JobProvider, RawJobDto } from './dto/raw-job.dto.js';
import { ChunkService } from './chunk.service.js';

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
    private readonly chunkService: ChunkService,
    private readonly prisma: PrismaService,
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
                const chunks = this.chunkService.buildChunks(raw);
                const embedded: Array<{
                  type: string;
                  text: string;
                  embedding: number[];
                  model: string;
                }> = [];
                for (const c of chunks) {
                  const embedding = await this.embeddingService.embed(c.text);
                  embedded.push({
                    type: c.type,
                    text: c.text,
                    embedding,
                    model: this.embeddingService.modelName,
                  });
                }
                await this.vectorRepo.upsertChunks(jobToEmbed.id, embedded);
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
              const chunks = this.chunkService.buildChunks(raw);
              const embedded: Array<{
                type: string;
                text: string;
                embedding: number[];
                model: string;
              }> = [];
              for (const c of chunks) {
                const embedding = await this.embeddingService.embed(c.text);
                embedded.push({
                  type: c.type,
                  text: c.text,
                  embedding,
                  model: this.embeddingService.modelName,
                });
              }
              await this.vectorRepo.upsertChunks(job.id, embedded);
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

  async resetAndRunFromCsv(
    csvPath = resolve(process.cwd(), 'export.csv'),
  ): Promise<{ loaded: number; stored: number }> {
    if (this.isRunning) {
      this.logger.warn('Ingestion already running, skipping');
      return { loaded: 0, stored: 0 };
    }

    this.isRunning = true;
    try {
      this.logger.log('Truncating JobChunk and Job tables');
      await this.prisma.$transaction([
        this.prisma.jobChunk.deleteMany(),
        this.prisma.job.deleteMany(),
      ]);

      this.logger.log(`Parsing CSV: ${csvPath}`);
      const content = readFileSync(csvPath, 'utf-8');
      const rows = this.parseCsv(content);
      this.logger.log(`CSV rows loaded: ${rows.length}`);

      let stored = 0;
      for (const row of rows) {
        const raw: RawJobDto = {
          sourceId: row.sourceId,
          source: row.source,
          title: row.title,
          company: row.company,
          location: row.location || undefined,
          description: row.description,
          url: row.url,
          jobType: row.jobType || undefined,
          minSalary: row.minSalary ? parseFloat(row.minSalary) : undefined,
          maxSalary: row.maxSalary ? parseFloat(row.maxSalary) : undefined,
        };

        const contentHash = this.hashJob(raw);
        const job = await this.jobRepo.upsertJob({ ...raw, contentHash });
        stored++;

        void this.queue.add(async () => {
          try {
            const chunks = this.chunkService.buildChunks(raw);
            const embedded: Array<{
              type: string;
              text: string;
              embedding: number[];
              model: string;
            }> = [];
            for (const c of chunks) {
              const embedding = await this.embeddingService.embed(c.text);
              embedded.push({
                type: c.type,
                text: c.text,
                embedding,
                model: this.embeddingService.modelName,
              });
            }
            await this.vectorRepo.upsertChunks(job.id, embedded);
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
        `Reset+ingest complete — loaded=${rows.length} stored=${stored}`,
      );
      return { loaded: rows.length, stored };
    } finally {
      this.isRunning = false;
    }
  }

  private parseCsv(content: string): Record<string, string>[] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let current = '';
    let inQuote = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      if (char === '"') {
        if (inQuote && content[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (char === ',' && !inQuote) {
        currentRow.push(current);
        current = '';
      } else if (char === '\n' && !inQuote) {
        currentRow.push(current);
        current = '';
        rows.push(currentRow);
        currentRow = [];
      } else if (char === '\r') {
        // skip CR
      } else {
        current += char;
      }
    }
    if (current || currentRow.length > 0) {
      currentRow.push(current);
      rows.push(currentRow);
    }

    const [headerRow, ...dataRows] = rows;
    return dataRows
      .filter((row) => row.length === headerRow.length)
      .map((row) => {
        const obj: Record<string, string> = {};
        headerRow.forEach((h, i) => {
          obj[h] = row[i];
        });
        return obj;
      });
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
}
