import { rankJobsFromChunks } from '../../rag/job-ranking.js';
import type {
  SearchOptions,
  VectorStore,
} from '../../storage/vector-store/vector-store.interface.js';
import type { RetrievalSystem, RetrievedJob } from './retrieval-system.js';

// Chunks retrieved before grouping by job; deep enough that the top 10 jobs
// are rarely limited by it (a job has at most 6 chunks).
export const DENSE_CHUNK_DEPTH = 50;

export type QueryEmbedder = (query: string) => Promise<number[]>;

// Dense retrieval through a vector store, ranked into jobs exactly like the
// production RAG pipeline (best chunk per job).
export class DenseSystem implements RetrievalSystem {
  constructor(
    readonly name: string,
    private readonly store: VectorStore,
    private readonly embed: QueryEmbedder,
    private readonly options: Omit<SearchOptions, 'topK'> = {},
  ) {}

  async retrieve(query: string, depth: number): Promise<RetrievedJob[]> {
    return this.retrieveByVector(await this.embed(query), depth);
  }

  async retrieveByVector(
    vector: number[],
    depth: number,
  ): Promise<RetrievedJob[]> {
    const chunks = await this.store.search(vector, {
      topK: DENSE_CHUNK_DEPTH,
      ...this.options,
    });
    return rankJobsFromChunks(chunks)
      .slice(0, depth)
      .map((job) => ({ jobId: job.jobId, score: job.score }));
  }
}

// Embeds each distinct query once, so several dense systems share vectors.
export function memoizedEmbedder(embed: QueryEmbedder): QueryEmbedder {
  const cache = new Map<string, Promise<number[]>>();
  return (query) => {
    let vector = cache.get(query);
    if (!vector) {
      vector = embed(query);
      cache.set(query, vector);
    }
    return vector;
  };
}
