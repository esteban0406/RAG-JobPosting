import type { Job } from '../../../generated/prisma/client.js';
import { Bm25Index, jobSearchText } from '../../retrieval/bm25.js';
import type { RetrievalSystem, RetrievedJob } from './retrieval-system.js';

// Strong lexical baseline: BM25 over title, skills and description.
export class Bm25System implements RetrievalSystem {
  readonly name = 'bm25';
  private readonly index: Bm25Index;

  constructor(
    jobs: Array<Pick<Job, 'id' | 'title' | 'skills' | 'description'>>,
  ) {
    this.index = new Bm25Index(
      jobs.map((job) => ({ id: job.id, text: jobSearchText(job) })),
    );
  }

  retrieve(query: string, depth: number): Promise<RetrievedJob[]> {
    return Promise.resolve(
      this.index
        .search(query, depth)
        .map((hit) => ({ jobId: hit.id, score: hit.score })),
    );
  }
}
