import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { VectorRepository } from '../storage/vector.repository.js';
import { QueryCategory } from './dataset/queries.dataset.js';
import { LabelingService } from './labeling.service.js';

const TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.5;

export interface QueryMetrics {
  queryId: string;
  category: QueryCategory;
  query: string;
  recall_at_k: number;
  precision_at_k: number;
  mrr: number;
  retrieved_ids: string[];
  relevant_ids: string[];
  retrieved_count: number;
  label_warning?: string;
}

export interface EvalReport {
  run_at: string;
  top_k: number;
  similarity_threshold: number;
  aggregate: {
    recall_at_k: number;
    precision_at_k: number;
    mrr: number;
    query_count: number;
    queries_with_results: number;
  };
  by_category: Record<
    QueryCategory,
    { recall_at_k: number; precision_at_k: number; mrr: number; count: number }
  >;
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

    const perQuery: QueryMetrics[] = [];

    for (const q of labeled) {
      const queryVector = await this.embeddingService.embedQuery(q.query);
      const chunks = await this.vectorRepo.findSimilar(
        queryVector,
        TOP_K,
        SIMILARITY_THRESHOLD,
      );

      const retrievedIds = chunks.map((c) => c.jobId);
      const relevantSet = new Set(q.relevant_job_ids);
      const relevantFound = retrievedIds.filter((id) => relevantSet.has(id));

      const recall_at_k =
        q.relevant_job_ids.length === 0
          ? 0
          : relevantFound.length / q.relevant_job_ids.length;

      const precision_at_k =
        retrievedIds.length === 0
          ? 0
          : relevantFound.length / retrievedIds.length;

      const firstRelevantRank = retrievedIds.findIndex((id) =>
        relevantSet.has(id),
      );
      const mrr = firstRelevantRank === -1 ? 0 : 1 / (firstRelevantRank + 1);

      perQuery.push({
        queryId: q.id,
        category: q.category,
        query: q.query,
        recall_at_k: Math.round(recall_at_k * 1000) / 1000,
        precision_at_k: Math.round(precision_at_k * 1000) / 1000,
        mrr: Math.round(mrr * 1000) / 1000,
        retrieved_ids: retrievedIds,
        relevant_ids: q.relevant_job_ids,
        retrieved_count: chunks.length,
        label_warning: q.label_warning,
      });
    }

    return {
      run_at: new Date().toISOString(),
      top_k: TOP_K,
      similarity_threshold: SIMILARITY_THRESHOLD,
      aggregate: this.computeAggregate(perQuery),
      by_category: this.computeByCategory(perQuery),
      per_query: perQuery,
    };
  }

  private computeAggregate(metrics: QueryMetrics[]): EvalReport['aggregate'] {
    const n = metrics.length;
    if (n === 0) {
      return {
        recall_at_k: 0,
        precision_at_k: 0,
        mrr: 0,
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
        result[cat] = { recall_at_k: 0, precision_at_k: 0, mrr: 0, count: 0 };
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
        count,
      };
    }

    return result;
  }
}
