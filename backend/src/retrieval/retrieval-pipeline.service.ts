import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { performance } from 'perf_hooks';
import type { Job } from '../../generated/prisma/client.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { rankJobsFromChunks } from '../rag/job-ranking.js';
import { JobRepository } from '../storage/job.repository.js';
import {
  VECTOR_STORE,
  type JobChunkResult,
  type SearchOptions,
  type VectorFilter,
  type VectorStore,
} from '../storage/vector-store/vector-store.interface.js';
import { Bm25IndexService } from './bm25-index.service.js';
import { chunksText, jobHeader } from './job-text.js';
import { RerankService } from './rerank.service.js';
import { fuseRrf } from './rrf.js';

// Chunks retrieved before grouping by job; a job has at most 6 chunks.
export const DENSE_CHUNK_DEPTH = 50;
// Jobs retrieved by BM25 before fusion.
export const LEXICAL_DEPTH = 50;
// Job text passed to the reranker, which reads at most 512 tokens.
const RERANK_DOCUMENT_CHARS = 2000;

export interface RetrievalOptions {
  // Jobs to return.
  depth: number;
  filter?: VectorFilter;
  // Defaults: RETRIEVAL_HYBRID and RERANK_ENABLED.
  hybrid?: boolean;
  rerank?: boolean;
  // Drops reranked jobs scoring below this; defaults to RERANK_MIN_SCORE.
  minRerankScore?: number;
  // Defaults: RERANK_CANDIDATES and RERANK_FUSION.
  rerankCandidates?: number;
  rerankFusion?: RerankFusion;
  // Precomputed query vector (the evaluation embeds each query once).
  queryVector?: number[];
  // ANN parameters for the evaluation; production uses the store defaults.
  search?: Pick<SearchOptions, 'mode' | 'efSearch'>;
  // Fail instead of keeping the fused order when the reranker is down, so an
  // evaluation run never mixes reranked and unreranked queries.
  strictRerank?: boolean;
}

export type RerankFusion = 'replace' | 'rrf';

export interface RetrievalHit {
  job: Job;
  // Final ranking score: rerank probability, RRF score or cosine similarity.
  score: number;
  // The reranker's relevance probability, when the job was reranked.
  rerankScore?: number;
  // Cosine similarity of the job's best chunk.
  similarity: number;
  // The job's chunks, most similar to the query first.
  chunks: JobChunkResult[];
}

export interface RetrievalTimings {
  embedMs: number;
  denseMs: number;
  bm25Ms: number;
  fuseMs: number;
  fetchMs: number;
  rerankMs: number;
}

export interface RetrievalResult {
  hits: RetrievalHit[];
  // The filter matched nothing and the search was repeated without it.
  filterRelaxed: boolean;
  reranked: boolean;
  timings: RetrievalTimings;
}

interface CandidateLists {
  dense: Array<{ id: string; score: number }>;
  lexical: string[];
}

// Retrieval shared by the RAG pipeline and the evaluation harness:
// dense search (and, if hybrid, BM25) under the same structured filter,
// reciprocal rank fusion, then cross-encoder reranking of the fused pool.
@Injectable()
export class RetrievalPipeline {
  private readonly logger = new Logger(RetrievalPipeline.name);
  private readonly hybridDefault: boolean;
  private readonly rerankDefault: boolean;
  private readonly rerankCandidates: number;
  private readonly rerankFusion: RerankFusion;
  private readonly minRerankScore?: number;

  constructor(
    private readonly embedding: EmbeddingService,
    @Inject(VECTOR_STORE) private readonly store: VectorStore,
    private readonly jobs: JobRepository,
    private readonly bm25: Bm25IndexService,
    private readonly reranker: RerankService,
    private readonly config: ConfigService,
  ) {
    this.hybridDefault =
      config.get<string>('RETRIEVAL_HYBRID', 'true') === 'true';
    this.rerankDefault =
      config.get<string>('RERANK_ENABLED', 'true') === 'true';
    this.rerankCandidates = Number(config.get('RERANK_CANDIDATES', 30));
    this.rerankFusion =
      config.get<string>('RERANK_FUSION', 'replace') === 'rrf'
        ? 'rrf'
        : 'replace';
    const minScore = config.get<number | string>('RERANK_MIN_SCORE');
    this.minRerankScore =
      minScore === undefined || minScore === '' ? undefined : Number(minScore);
  }

  get vectorBackend(): string {
    return this.store.backend;
  }

  // The same pipeline over another vector store (the evaluation compares them).
  withStore(store: VectorStore): RetrievalPipeline {
    return new RetrievalPipeline(
      this.embedding,
      store,
      this.jobs,
      this.bm25,
      this.reranker,
      this.config,
    );
  }

  // The same pipeline with another reranker (model or instruction).
  withReranker(reranker: RerankService): RetrievalPipeline {
    return new RetrievalPipeline(
      this.embedding,
      this.store,
      this.jobs,
      this.bm25,
      reranker,
      this.config,
    );
  }

  async retrieve(
    query: string,
    options: RetrievalOptions,
  ): Promise<RetrievalResult> {
    const timings: RetrievalTimings = {
      embedMs: 0,
      denseMs: 0,
      bm25Ms: 0,
      fuseMs: 0,
      fetchMs: 0,
      rerankMs: 0,
    };
    const hybrid = options.hybrid ?? this.hybridDefault;
    const rerank = options.rerank ?? this.rerankDefault;

    let t = performance.now();
    const vector =
      options.queryVector ?? (await this.embedding.embedQuery(query));
    if (!options.queryVector) timings.embedMs = performance.now() - t;

    let lists = await this.candidates(query, vector, options, hybrid, timings);
    let filterRelaxed = false;
    if (
      options.filter &&
      lists.dense.length === 0 &&
      lists.lexical.length === 0
    ) {
      lists = await this.candidates(
        query,
        vector,
        { ...options, filter: undefined },
        hybrid,
        timings,
      );
      filterRelaxed = true;
    }

    t = performance.now();
    const ranked = hybrid
      ? fuseRrf([lists.dense.map((j) => j.id), lists.lexical])
      : lists.dense;
    timings.fuseMs = performance.now() - t;

    const poolSize = rerank
      ? Math.max(
          options.rerankCandidates ?? this.rerankCandidates,
          options.depth,
        )
      : options.depth;
    const pool = ranked.slice(0, poolSize);
    if (pool.length === 0) {
      return { hits: [], filterRelaxed, reranked: false, timings };
    }

    t = performance.now();
    const ids = pool.map((p) => p.id);
    const [jobs, chunks] = await Promise.all([
      this.jobs.findByIds(ids),
      this.store.findSimilarByJobIds(vector, ids),
    ]);
    timings.fetchMs = performance.now() - t;

    const jobMap = new Map(jobs.map((j) => [j.id, j]));
    const chunksByJob = new Map(
      rankJobsFromChunks(chunks).map((r) => [r.jobId, r.chunks]),
    );
    let hits: RetrievalHit[] = [];
    for (const { id, score } of pool) {
      const job = jobMap.get(id);
      if (!job) continue;
      const jobChunks = chunksByJob.get(id) ?? [];
      hits.push({
        job,
        score,
        similarity: jobChunks[0]?.similarity ?? 0,
        chunks: jobChunks,
      });
    }

    let reranked = false;
    if (rerank && hits.length > 0) {
      t = performance.now();
      try {
        const { scores } = await this.reranker.score(
          query,
          hits.map((h) => rerankDocument(h)),
        );
        hits = this.applyRerank(
          hits,
          scores,
          options.rerankFusion ?? this.rerankFusion,
        );
        reranked = true;
        const minScore = options.minRerankScore ?? this.minRerankScore;
        if (minScore !== undefined) {
          hits = hits.filter((h) => (h.rerankScore ?? 0) >= minScore);
        }
      } catch (err) {
        if (options.strictRerank) throw err;
        this.logger.warn(
          `Reranker unavailable, keeping the fused order: ${(err as Error).message}`,
        );
      }
      timings.rerankMs = performance.now() - t;
    }

    return {
      hits: hits.slice(0, options.depth),
      filterRelaxed,
      reranked,
      timings,
    };
  }

  // replace: order by rerank probability. rrf: fuse the first-stage order
  // with the rerank order, so one literal-minded score cannot sink a job
  // the first stage ranked high.
  private applyRerank(
    hits: RetrievalHit[],
    scores: number[],
    fusion: RerankFusion,
  ): RetrievalHit[] {
    const scored = hits.map((h, i) => ({ ...h, rerankScore: scores[i] }));
    if (fusion === 'replace') {
      return scored
        .map((h) => ({ ...h, score: h.rerankScore }))
        .sort((a, b) => b.score - a.score);
    }
    const byRerank = [...scored].sort((a, b) => b.rerankScore - a.rerankScore);
    const fused = fuseRrf([
      scored.map((h) => h.job.id),
      byRerank.map((h) => h.job.id),
    ]);
    const byId = new Map(scored.map((h) => [h.job.id, h]));
    return fused.map(({ id, score }) => ({ ...byId.get(id)!, score }));
  }

  private async candidates(
    query: string,
    vector: number[],
    options: RetrievalOptions,
    hybrid: boolean,
    timings: RetrievalTimings,
  ): Promise<CandidateLists> {
    let t = performance.now();
    const chunks = await this.store.search(vector, {
      topK: DENSE_CHUNK_DEPTH,
      filter: options.filter,
      ...options.search,
    });
    const dense = rankJobsFromChunks(chunks).map((r) => ({
      id: r.jobId,
      score: r.score,
    }));
    timings.denseMs += performance.now() - t;

    let lexical: string[] = [];
    if (hybrid) {
      t = performance.now();
      const hits = await this.bm25.search(query, LEXICAL_DEPTH, options.filter);
      lexical = hits.map((h) => h.id);
      timings.bm25Ms += performance.now() - t;
    }
    return { dense, lexical };
  }
}

// What the cross-encoder reads for a job: its header and its chunks.
export function rerankDocument(hit: Pick<RetrievalHit, 'job' | 'chunks'>) {
  const header = jobHeader(hit.job).replace(/^Job: /, '');
  return `${header}\n${chunksText(hit.chunks, RERANK_DOCUMENT_CHARS)}`.slice(
    0,
    RERANK_DOCUMENT_CHARS,
  );
}
