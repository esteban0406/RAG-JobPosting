import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import PQueue from 'p-queue';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { JobRepository } from '../storage/job.repository.js';
import { VectorRepository } from '../storage/vector.repository.js';
import { PrismaService } from '../storage/prisma.service.js';
import { RemotiveProvider } from './providers/remotive.provider.js';
import { JobicyProvider } from './providers/jobicy.provider.js';
import { FindworkProvider } from './providers/findwork.provider.js';
import { JobProvider, RawJobDto } from './dto/raw-job.dto.js';
import { ChunkService } from './chunk.service.js';
import {
  DailyQuotaExhaustedException,
  JobParserService,
} from '../llm/job-parser.service.js';
import { NULL_PARSED_JOB, ParsedJobDto } from '../llm/parsed-job.dto.js';
import { normalizeSalary } from './salary-normalizer.js';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private isRunning = false;
  private readonly embedQueue: PQueue;
  private readonly parseQueue: PQueue;
  private readonly providers: JobProvider[];

  constructor(
    remotive: RemotiveProvider,
    jobicy: JobicyProvider,
    findwork: FindworkProvider,
    private readonly jobRepo: JobRepository,
    private readonly vectorRepo: VectorRepository,
    private readonly embeddingService: EmbeddingService,
    private readonly chunkService: ChunkService,
    private readonly prisma: PrismaService,
    private readonly jobParser: JobParserService,
  ) {
    this.providers = [remotive, jobicy, findwork];

    const isGemini = embeddingService.provider === 'gemini';
    this.embedQueue = new PQueue(
      isGemini
        ? { concurrency: 1, interval: 2000, intervalCap: 1 }
        : { concurrency: 5 },
    );

    const isProduction = process.env.NODE_ENV === 'production';
    this.parseQueue = new PQueue(
      isProduction
        ? { concurrency: 2, interval: 2000, intervalCap: 1 }
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

      const providerResults = await Promise.allSettled(
        this.providers.map((p) =>
          this.fetchAllPages(p).then((jobs) => ({ provider: p, jobs })),
        ),
      );

      const allJobs: RawJobDto[] = [];
      for (const result of providerResults) {
        if (result.status === 'rejected') {
          this.logger.error(
            `Provider fetch failed: ${(result.reason as Error).message}`,
          );
          continue;
        }
        const { provider, jobs } = result.value;
        fetched += jobs.length;
        this.logger.log(
          `Fetched ${jobs.length} jobs from ${provider.constructor.name}`,
        );
        allJobs.push(...jobs);
      }

      for (const raw of allJobs) {
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
          void this.embedQueue.add(async () => {
            try {
              const chunks = this.chunkService.buildChunks(raw, jobToEmbed);
              await this.embedAndStoreChunks(jobToEmbed.id, chunks);
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

        // New job — parse then store
        void this.parseQueue.add(async () => {
          let parsed: ParsedJobDto;
          try {
            parsed = await this.jobParser.parse(raw.description);
          } catch (err) {
            if (err instanceof DailyQuotaExhaustedException) {
              this.logger.warn(
                'Daily quota exhausted — draining parse queue with null results',
              );
              this.parseQueue.clear();
              parsed = NULL_PARSED_JOB;
            } else {
              parsed = NULL_PARSED_JOB;
            }
          }

          const mergedSkills = dedupeSubstrings(
            dedupeInsensitive([
              ...(parsed.skills ?? []),
              ...filterKeywords(raw.keywords ?? []),
            ]),
          );

          const salaryNums =
            raw.minSalary != null || raw.maxSalary != null
              ? { minSalary: raw.minSalary, maxSalary: raw.maxSalary }
              : normalizeSalary({ raw: parsed.salary ?? undefined });

          const job = await this.jobRepo.upsertJob({
            sourceId: raw.sourceId,
            source: raw.source,
            title: raw.title,
            company: raw.company,
            location: raw.location,
            description: raw.description,
            url: raw.url,
            jobType: raw.jobType,
            minSalary: salaryNums.minSalary,
            maxSalary: salaryNums.maxSalary,
            logo: raw.logo ?? null,
            contentHash,
            summary: parsed.summary,
            salary: parsed.salary,
            responsibilities: parsed.responsibilities ?? [],
            requirements: parsed.requirements ?? [],
            benefits: parsed.benefits ?? [],
            skills: mergedSkills,
          });
          stored++;

          void this.embedQueue.add(async () => {
            try {
              const chunks = this.chunkService.buildChunks(raw, job);
              await this.embedAndStoreChunks(job.id, chunks);
              this.logger.debug(`Embedded job: ${job.title} (${job.company})`);
            } catch (err) {
              this.logger.error(
                `Failed to embed job ${job.id}: ${(err as Error).message}`,
              );
            }
          });
        });
      }

      await this.parseQueue.onIdle();
      await this.embedQueue.onIdle();
      this.logger.log(
        `Ingestion complete — fetched=${fetched} stored=${stored} skipped=${skipped}`,
      );
    } finally {
      this.isRunning = false;
    }

    return { fetched, stored, skipped };
  }

  private async embedAndStoreChunks(
    jobId: string,
    chunks: Array<{ type: string; text: string }>,
  ): Promise<void> {
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
    await this.vectorRepo.upsertChunks(jobId, embedded);
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

        void this.embedQueue.add(async () => {
          try {
            const chunks = this.chunkService.buildChunks(raw, job);
            await this.embedAndStoreChunks(job.id, chunks);
            this.logger.debug(`Embedded job: ${job.title} (${job.company})`);
          } catch (err) {
            this.logger.error(
              `Failed to embed job ${job.id}: ${(err as Error).message}`,
            );
          }
        });
      }

      await this.embedQueue.onIdle();
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

/**
 * Removes entries that are a case-insensitive substring of another entry.
 * Catches provider keywords like "aws" when "AWS/GCP serverless technologies"
 * is already in the list from the LLM extraction.
 */
function dedupeSubstrings(arr: string[]): string[] {
  const lower = arr.map((s) => s.toLowerCase());
  return arr.filter((_, i) =>
    lower.every(
      (other, j) =>
        i === j ||
        !other.includes(lower[i]) ||
        other.length === lower[i].length,
    ),
  );
}

function dedupeInsensitive(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Generic words that provider keyword systems sometimes emit but are not tool names.
const KEYWORD_STOPWORDS = new Set([
  'ai',
  'ml',
  'api',
  'qa',
  'ux',
  'ui',
  'cloud',
  'crm',
  'erp',
  'cms',
  'seo',
  'ads',
  'agents',
  'analytics',
  'coverage',
  'ancestry',
  'prompting',
  'remote',
  'saas',
  'paas',
  'iaas',
]);

/**
 * Filters a provider keyword array down to plausible tool/technology names.
 * Rejects: single-character tokens, known stopwords, and pure-number strings.
 */
function filterKeywords(keywords: string[]): string[] {
  return keywords.filter((kw) => {
    const lower = kw.toLowerCase().trim();
    return (
      lower.length >= 2 && !KEYWORD_STOPWORDS.has(lower) && !/^\d+$/.test(lower)
    );
  });
}
