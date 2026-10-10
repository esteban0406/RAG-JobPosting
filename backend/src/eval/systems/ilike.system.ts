import type { JobRepository } from '../../storage/job.repository.js';
import type { RetrievalSystem, RetrievedJob } from './retrieval-system.js';

// The keyword search the platform offers today: case-insensitive substring
// match of the whole query on title or company, newest first.
export class IlikeSystem implements RetrievalSystem {
  readonly name = 'ilike';

  constructor(private readonly jobs: JobRepository) {}

  async retrieve(query: string, depth: number): Promise<RetrievedJob[]> {
    const rows = await this.jobs.findAll({ keyword: query, limit: depth });
    // No relevance score exists; the rank position stands in for it.
    return rows.map((job, i) => ({ jobId: job.id, score: 1 / (i + 1) }));
  }
}
