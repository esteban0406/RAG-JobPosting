import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { VectorRepository } from '../storage/vector.repository.js';
import { QueryCategory } from './dataset/queries.dataset.js';
import { LabeledQuery, LabelingService } from './labeling.service.js';

const MAX_K = 10;
const KS = [1, 3, 5, 10] as const;
const DEFAULT_K = 5;
const SIMILARITY_THRESHOLD = 0.5;
const CONCURRENCY = 5;

interface KMetrics {
  recall_at_k: number;
  precision_at_k: number;
  mrr: number;
  ndcg: number;
}

export interface QueryMetrics {
  queryId: string;
  category: QueryCategory;
  query: string;
  // Top-level metrics at DEFAULT_K, thresholded
  recall_at_k: number;
  precision_at_k: number;
  mrr: number;
  ndcg: number;
  retrieved: { jobId: string; score: number }[];
  relevant_ids: string[];
  retrieved_count: number;
  label_warning?: string;
  // Multi-K breakdown (thresholded)
  metrics_by_k: Record<number, KMetrics>;
  // Threshold comparison at DEFAULT_K
  unthresholded: {
    retrieved_ids: string[];
    recall_at_k: number;
    precision_at_k: number;
  };
}

export interface EvalReport {
  run_at: string;
  top_k: number;
  similarity_threshold: number;
  aggregate: {
    recall_at_k: number;
    precision_at_k: number;
    mrr: number;
    ndcg: number;
    query_count: number;
    queries_with_results: number;
  };
  by_category: Record<
    QueryCategory,
    {
      recall_at_k: number;
      precision_at_k: number;
      mrr: number;
      ndcg: number;
      count: number;
    }
  >;
  by_k: Record<number, KMetrics>;
  per_query: QueryMetrics[];
}

@Injectable()
export class EvalService {
  private readonly logger = new Logger(EvalService.name);

  constructor(
    private readonly labelingService: LabelingService,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorRepo: VectorRepository,
  ) {}

  async runEvaluation(): Promise<EvalReport> {
    const labeled = await this.labelingService.labelAll();
    this.logger.log(`Running evaluation for ${labeled.length} queries`);

    // Process queries in parallel with bounded concurrency
    const perQuery: QueryMetrics[] = [];
    for (let i = 0; i < labeled.length; i += CONCURRENCY) {
      const batch = labeled.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((q) => this.processQuery(q)));
      perQuery.push(...results);
    }

    return {
      run_at: new Date().toISOString(),
      top_k: DEFAULT_K,
      similarity_threshold: SIMILARITY_THRESHOLD,
      aggregate: this.computeAggregate(perQuery),
      by_category: this.computeByCategory(perQuery),
      by_k: this.computeByK(perQuery),
      per_query: perQuery,
    };
  }

  private async processQuery(q: LabeledQuery): Promise<QueryMetrics> {
    const queryVector = await this.embeddingService.embedQuery(q.query);

    // Single DB call at MAX_K with no threshold — filter software-side to avoid a second round-trip
    const allChunks = await this.vectorRepo.findSimilar(queryVector, MAX_K, 0);

    const thresholded = allChunks.filter(
      (c) => c.similarity >= SIMILARITY_THRESHOLD,
    );
    const relevantSet = new Set(q.relevant_job_ids);

    // Top-level metrics at DEFAULT_K, thresholded
    const topK = thresholded.slice(0, DEFAULT_K);
    const topKIds = topK.map((c) => c.jobId);
    const topKMetrics = this.computeMetrics(
      topKIds,
      relevantSet,
      q.relevant_job_ids.length,
    );

    // Unthresholded comparison at DEFAULT_K
    const rawIds = allChunks.slice(0, DEFAULT_K).map((c) => c.jobId);
    const rawRelevantFound = rawIds.filter((id) => relevantSet.has(id));
    const unthresholded = {
      retrieved_ids: rawIds,
      recall_at_k:
        q.relevant_job_ids.length === 0
          ? 0
          : Math.round(
              (rawRelevantFound.length / q.relevant_job_ids.length) * 1000,
            ) / 1000,
      precision_at_k:
        rawIds.length === 0
          ? 0
          : Math.round((rawRelevantFound.length / rawIds.length) * 1000) / 1000,
    };

    // Multi-K breakdown (thresholded)
    const metrics_by_k: QueryMetrics['metrics_by_k'] = {};
    for (const k of KS) {
      const ids = thresholded.slice(0, k).map((c) => c.jobId);
      metrics_by_k[k] = this.computeMetrics(
        ids,
        relevantSet,
        q.relevant_job_ids.length,
      );
    }

    return {
      queryId: q.id,
      category: q.category,
      query: q.query,
      ...topKMetrics,
      retrieved: topK.map((c) => ({
        jobId: c.jobId,
        score: Math.round(c.similarity * 1000) / 1000,
      })),
      relevant_ids: q.relevant_job_ids,
      retrieved_count: topK.length,
      label_warning: q.label_warning,
      metrics_by_k,
      unthresholded,
    };
  }

  private computeMetrics(
    retrievedIds: string[],
    relevantSet: Set<string>,
    relevantTotal: number,
  ): KMetrics {
    const relevantFound = retrievedIds.filter((id) => relevantSet.has(id));

    const recall_at_k =
      relevantTotal === 0
        ? 0
        : Math.round((relevantFound.length / relevantTotal) * 1000) / 1000;

    const precision_at_k =
      retrievedIds.length === 0
        ? 0
        : Math.round((relevantFound.length / retrievedIds.length) * 1000) /
          1000;

    const firstRelevantRank = retrievedIds.findIndex((id) =>
      relevantSet.has(id),
    );
    const mrr =
      firstRelevantRank === -1
        ? 0
        : Math.round((1 / (firstRelevantRank + 1)) * 1000) / 1000;

    const ndcg = this.computeNDCG(retrievedIds, relevantSet);

    return { recall_at_k, precision_at_k, mrr, ndcg };
  }

  private computeNDCG(
    retrievedIds: string[],
    relevantSet: Set<string>,
  ): number {
    let dcg = 0;
    for (let i = 0; i < retrievedIds.length; i++) {
      if (relevantSet.has(retrievedIds[i])) {
        dcg += 1 / Math.log2(i + 2);
      }
    }
    let idcg = 0;
    for (let i = 0; i < Math.min(relevantSet.size, retrievedIds.length); i++) {
      idcg += 1 / Math.log2(i + 2);
    }
    return idcg === 0 ? 0 : Math.round((dcg / idcg) * 1000) / 1000;
  }

  private computeAggregate(metrics: QueryMetrics[]): EvalReport['aggregate'] {
    const n = metrics.length;
    if (n === 0) {
      return {
        recall_at_k: 0,
        precision_at_k: 0,
        mrr: 0,
        ndcg: 0,
        query_count: 0,
        queries_with_results: 0,
      };
    }
    const avg = (key: keyof QueryMetrics) =>
      Math.round(
        (metrics.reduce((s, m) => s + (m[key] as number), 0) / n) * 1000,
      ) / 1000;
    return {
      recall_at_k: avg('recall_at_k'),
      precision_at_k: avg('precision_at_k'),
      mrr: avg('mrr'),
      ndcg: avg('ndcg'),
      query_count: n,
      queries_with_results: metrics.filter((m) => m.retrieved_count > 0).length,
    };
  }

  private computeByCategory(
    metrics: QueryMetrics[],
  ): EvalReport['by_category'] {
    const categories: QueryCategory[] = [
      'exact',
      'semantic',
      'filtering',
      'aggregation',
      'noisy',
    ];
    const result = {} as EvalReport['by_category'];

    for (const cat of categories) {
      const group = metrics.filter((m) => m.category === cat);
      const count = group.length;
      if (count === 0) {
        result[cat] = {
          recall_at_k: 0,
          precision_at_k: 0,
          mrr: 0,
          ndcg: 0,
          count: 0,
        };
        continue;
      }
      const avg = (key: keyof QueryMetrics) =>
        Math.round(
          (group.reduce((s, m) => s + (m[key] as number), 0) / count) * 1000,
        ) / 1000;
      result[cat] = {
        recall_at_k: avg('recall_at_k'),
        precision_at_k: avg('precision_at_k'),
        mrr: avg('mrr'),
        ndcg: avg('ndcg'),
        count,
      };
    }

    return result;
  }

  private computeByK(metrics: QueryMetrics[]): EvalReport['by_k'] {
    const n = metrics.length;
    const result = {} as EvalReport['by_k'];
    const round = (v: number) => Math.round(v * 1000) / 1000;

    for (const k of KS) {
      if (n === 0) {
        result[k] = { recall_at_k: 0, precision_at_k: 0, mrr: 0, ndcg: 0 };
        continue;
      }
      const sum = (key: keyof KMetrics) =>
        metrics.reduce((s, m) => s + m.metrics_by_k[k][key], 0);
      result[k] = {
        recall_at_k: round(sum('recall_at_k') / n),
        precision_at_k: round(sum('precision_at_k') / n),
        mrr: round(sum('mrr') / n),
        ndcg: round(sum('ndcg') / n),
      };
    }

    return result;
  }
}
