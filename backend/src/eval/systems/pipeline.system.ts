import type { RetrievalPipeline } from '../../retrieval/retrieval-pipeline.service.js';
import type {
  SearchOptions,
  VectorFilter,
} from '../../storage/vector-store/vector-store.interface.js';
import type { QueryEmbedder } from './dense.system.js';
import type { RetrievalSystem, RetrievedJob } from './retrieval-system.js';

export type FilterProvider = (
  query: string,
) => Promise<VectorFilter | undefined>;

export interface PipelineSystemOptions {
  hybrid: boolean;
  rerank: boolean;
  // Per-query structured filter, as production extracts it; none if omitted.
  filterFor?: FilterProvider;
  search?: Pick<SearchOptions, 'mode' | 'efSearch'>;
}

// The production retrieval pipeline as an evaluated system. Each rung of the
// ablation ladder (filters, hybrid, rerank) is one of these configurations.
export class PipelineSystem implements RetrievalSystem {
  constructor(
    readonly name: string,
    private readonly pipeline: RetrievalPipeline,
    private readonly embed: QueryEmbedder,
    private readonly options: PipelineSystemOptions,
  ) {}

  async retrieve(query: string, depth: number): Promise<RetrievedJob[]> {
    const [queryVector, filter] = await Promise.all([
      this.embed(query),
      this.options.filterFor?.(query),
    ]);
    const result = await this.pipeline.retrieve(query, {
      depth,
      filter,
      hybrid: this.options.hybrid,
      rerank: this.options.rerank,
      queryVector,
      search: this.options.search,
      strictRerank: true,
      // Ranked lists are evaluated in full; no score cut-off.
      minRerankScore: Number.NEGATIVE_INFINITY,
    });
    return result.hits.map((hit) => ({ jobId: hit.job.id, score: hit.score }));
  }
}
