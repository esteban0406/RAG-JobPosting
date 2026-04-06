import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { VectorRepository } from '../storage/vector.repository.js';
import { QUERIES, QueryCategory } from './dataset/queries.dataset.js';
import { GeminiJudgeService } from './judge/gemini-judge.service.js';
import { Verdict } from './judge/judge.interface.js';
import { JudgmentCacheService } from './judge/judgment-cache.service.js';
import { OllamaJudgeService } from './judge/ollama-judge.service.js';

const MAX_K = 10;
const KS = [1, 3, 5, 10] as const;
const DEFAULT_K = 5;
const SIMILARITY_THRESHOLD = 0.5;
const QUERY_CONCURRENCY = 3;
const JUDGE_CONCURRENCY_LOCAL = 3;
const JUDGE_CONCURRENCY_GEMINI = 1;

interface KMetrics {
  precision_at_k: number;
  mrr: number;
  ndcg: number;
}

export interface RetrievedResult {
  jobId: string;
  score: number;
  verdict: Verdict;
}

export interface QueryMetrics {
  queryId: string;
  category: QueryCategory;
  query: string;
  // Top-level metrics at DEFAULT_K
  precision_at_k: number;
  mrr: number;
  ndcg: number;
  retrieved: RetrievedResult[];
  retrieved_count: number;
  // Multi-K breakdown
  metrics_by_k: Record<number, KMetrics>;
  // Verdict summary
  verdict_counts: { relevant: number; marginal: number; not_relevant: number };
}

export interface EvalReport {
  run_at: string;
  top_k: number;
  similarity_threshold: number;
  judge: 'local' | 'gemini';
  marginal_count: number;
  aggregate: {
    precision_at_k: number;
    mrr: number;
    ndcg: number;
    query_count: number;
    queries_with_results: number;
    queries_with_zero_relevant: number;
  };
  by_category: Record<
    QueryCategory,
    {
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
    private readonly embeddingService: EmbeddingService,
    private readonly vectorRepo: VectorRepository,
    private readonly ollamaJudge: OllamaJudgeService,
    private readonly geminiJudge: GeminiJudgeService,
    private readonly judgeCache: JudgmentCacheService,
  ) {}

  async runEvaluation(judge: 'local' | 'gemini' = 'local'): Promise<EvalReport> {
    this.logger.log(`Running evaluation (judge=${judge}) for ${QUERIES.length} queries`);

    const perQuery: QueryMetrics[] = [];
    for (let i = 0; i < QUERIES.length; i += QUERY_CONCURRENCY) {
      const batch = QUERIES.slice(i, i + QUERY_CONCURRENCY);
      const results = await Promise.all(
        batch.map((q) => this.processQuery(q.id, q.query, q.category, judge)),
      );
      perQuery.push(...results);
    }

    const marginal_count = perQuery.reduce(
      (sum, q) => sum + q.verdict_counts.marginal,
      0,
    );

    return {
      run_at: new Date().toISOString(),
      top_k: DEFAULT_K,
      similarity_threshold: SIMILARITY_THRESHOLD,
      judge,
      marginal_count,
      aggregate: this.computeAggregate(perQuery),
      by_category: this.computeByCategory(perQuery),
      by_k: this.computeByK(perQuery),
      per_query: perQuery,
    };
  }

  private async processQuery(
    queryId: string,
    queryText: string,
    category: QueryCategory,
    judgeType: 'local' | 'gemini',
  ): Promise<QueryMetrics> {
    const queryVector = await this.embeddingService.embedQuery(queryText);

    // Retrieve top MAX_K results with job data in a single SQL call
    const chunks = await this.vectorRepo.findSimilarWithJob(
      queryVector,
      MAX_K,
      SIMILARITY_THRESHOLD,
    );

    // Deduplicate by jobId — keep highest-similarity chunk per job
    const seen = new Map<string, typeof chunks[0]>();
    for (const chunk of chunks) {
      if (!seen.has(chunk.jobId) || chunk.similarity > seen.get(chunk.jobId)!.similarity) {
        seen.set(chunk.jobId, chunk);
      }
    }
    const deduplicated = Array.from(seen.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, MAX_K);

    // Judge each retrieved result
    const judgeService = judgeType === 'local' ? this.ollamaJudge : this.geminiJudge;
    const concurrency =
      judgeType === 'local' ? JUDGE_CONCURRENCY_LOCAL : JUDGE_CONCURRENCY_GEMINI;

    const verdicts: Verdict[] = new Array(deduplicated.length).fill('not_relevant');
    for (let i = 0; i < deduplicated.length; i += concurrency) {
      const batch = deduplicated.slice(i, i + concurrency);
      const batchVerdicts = await Promise.all(
        batch.map(async (chunk, batchIdx) => {
          const cached = this.judgeCache.get(judgeType, queryId, chunk.jobId);
          if (cached !== undefined) return cached;
          const verdict = await judgeService.judge(
            queryText,
            chunk.jobTitle,
            chunk.jobDescription,
          );
          this.judgeCache.set(judgeType, queryId, chunk.jobId, verdict);
          return verdict;
        }),
      );
      for (let j = 0; j < batchVerdicts.length; j++) {
        verdicts[i + j] = batchVerdicts[j];
      }
    }

    const retrieved: RetrievedResult[] = deduplicated.map((chunk, i) => ({
      jobId: chunk.jobId,
      score: Math.round(chunk.similarity * 1000) / 1000,
      verdict: verdicts[i],
    }));

    const verdict_counts = {
      relevant: verdicts.filter((v) => v === 'relevant').length,
      marginal: verdicts.filter((v) => v === 'marginal').length,
      not_relevant: verdicts.filter((v) => v === 'not_relevant').length,
    };

    // Compute metrics at DEFAULT_K
    const topK = retrieved.slice(0, DEFAULT_K);
    const topKMetrics = this.computeMetrics(topK);

    // Multi-K breakdown
    const metrics_by_k: QueryMetrics['metrics_by_k'] = {};
    for (const k of KS) {
      metrics_by_k[k] = this.computeMetrics(retrieved.slice(0, k));
    }

    return {
      queryId,
      category,
      query: queryText,
      ...topKMetrics,
      retrieved: topK,
      retrieved_count: topK.length,
      metrics_by_k,
      verdict_counts,
    };
  }

  private computeMetrics(results: RetrievedResult[]): KMetrics {
    if (results.length === 0) {
      return { precision_at_k: 0, mrr: 0, ndcg: 0 };
    }

    const relevantFlags = results.map((r) => r.verdict === 'relevant');
    const relevantCount = relevantFlags.filter(Boolean).length;

    const precision_at_k = Math.round((relevantCount / results.length) * 1000) / 1000;

    const firstRelevantIdx = relevantFlags.findIndex(Boolean);
    const mrr =
      firstRelevantIdx === -1
        ? 0
        : Math.round((1 / (firstRelevantIdx + 1)) * 1000) / 1000;

    let dcg = 0;
    let idcg = 0;
    for (let i = 0; i < results.length; i++) {
      const gain = relevantFlags[i] ? 1 : 0;
      dcg += gain / Math.log2(i + 2);
      if (i < relevantCount) idcg += 1 / Math.log2(i + 2);
    }
    const ndcg = idcg === 0 ? 0 : Math.round((dcg / idcg) * 1000) / 1000;

    return { precision_at_k, mrr, ndcg };
  }

  private computeAggregate(metrics: QueryMetrics[]): EvalReport['aggregate'] {
    const n = metrics.length;
    if (n === 0) {
      return { precision_at_k: 0, mrr: 0, ndcg: 0, query_count: 0, queries_with_results: 0, queries_with_zero_relevant: 0 };
    }
    const avg = (key: keyof Pick<QueryMetrics, 'precision_at_k' | 'mrr' | 'ndcg'>) =>
      Math.round((metrics.reduce((s, m) => s + m[key], 0) / n) * 1000) / 1000;

    return {
      precision_at_k: avg('precision_at_k'),
      mrr: avg('mrr'),
      ndcg: avg('ndcg'),
      query_count: n,
      queries_with_results: metrics.filter((m) => m.retrieved_count > 0).length,
      queries_with_zero_relevant: metrics.filter((m) => m.verdict_counts.relevant === 0).length,
    };
  }

  private computeByCategory(metrics: QueryMetrics[]): EvalReport['by_category'] {
    const categories: QueryCategory[] = ['exact', 'semantic', 'filtering', 'aggregation', 'noisy'];
    const result = {} as EvalReport['by_category'];

    for (const cat of categories) {
      const group = metrics.filter((m) => m.category === cat);
      const count = group.length;
      if (count === 0) {
        result[cat] = { precision_at_k: 0, mrr: 0, ndcg: 0, count: 0 };
        continue;
      }
      const avg = (key: keyof Pick<QueryMetrics, 'precision_at_k' | 'mrr' | 'ndcg'>) =>
        Math.round((group.reduce((s, m) => s + m[key], 0) / count) * 1000) / 1000;
      result[cat] = { precision_at_k: avg('precision_at_k'), mrr: avg('mrr'), ndcg: avg('ndcg'), count };
    }

    return result;
  }

  private computeByK(metrics: QueryMetrics[]): EvalReport['by_k'] {
    const n = metrics.length;
    const result = {} as EvalReport['by_k'];
    const round = (v: number) => Math.round(v * 1000) / 1000;

    for (const k of KS) {
      if (n === 0) {
        result[k] = { precision_at_k: 0, mrr: 0, ndcg: 0 };
        continue;
      }
      result[k] = {
        precision_at_k: round(metrics.reduce((s, m) => s + m.metrics_by_k[k].precision_at_k, 0) / n),
        mrr: round(metrics.reduce((s, m) => s + m.metrics_by_k[k].mrr, 0) / n),
        ndcg: round(metrics.reduce((s, m) => s + m.metrics_by_k[k].ndcg, 0) / n),
      };
    }

    return result;
  }
}
