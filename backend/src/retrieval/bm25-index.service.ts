import { Injectable, Logger } from '@nestjs/common';
import { JobRepository } from '../storage/job.repository.js';
import type { VectorFilter } from '../storage/vector-store/vector-store.interface.js';
import { Bm25Index, jobSearchText, type Bm25Hit } from './bm25.js';
import { matchesFilter, type FilterableJob } from './job-filter.js';

interface LoadedIndex {
  index: Bm25Index;
  jobs: Map<string, FilterableJob>;
}

// In-memory BM25 over every job: the lexical half of hybrid retrieval, and
// the same implementation the evaluation uses as its BM25 baseline. Built on
// first use and rebuilt after each ingestion run.
@Injectable()
export class Bm25IndexService {
  private readonly logger = new Logger(Bm25IndexService.name);
  private loading: Promise<LoadedIndex> | null = null;

  constructor(private readonly jobs: JobRepository) {}

  async search(
    query: string,
    k: number,
    filter?: VectorFilter,
  ): Promise<Bm25Hit[]> {
    const { index, jobs } = await this.load();
    const accept = filter
      ? (id: string) => {
          const job = jobs.get(id);
          return job !== undefined && matchesFilter(job, filter);
        }
      : undefined;
    return index.search(query, k, accept);
  }

  invalidate(): void {
    this.loading = null;
  }

  private load(): Promise<LoadedIndex> {
    this.loading ??= this.build().catch((err: Error) => {
      this.loading = null;
      throw err;
    });
    return this.loading;
  }

  private async build(): Promise<LoadedIndex> {
    const rows = await this.jobs.findAllUnpaged();
    const index = new Bm25Index(
      rows.map((job) => ({ id: job.id, text: jobSearchText(job) })),
    );
    this.logger.log(`BM25 index built over ${index.size} jobs`);
    return { index, jobs: new Map(rows.map((job) => [job.id, job])) };
  }
}
