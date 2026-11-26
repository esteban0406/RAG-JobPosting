import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { copyFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';
import { ClassificationCache } from '../../eval/classification-cache.js';
import { loadDataset } from '../../eval/dataset.js';
import { LlmService } from '../../llm/llm.service.js';
import { QueryClassifierService } from '../../query/query-classifier.service.js';
import { RagService } from '../../rag/rag.service.js';
import type { VectorFilter } from '../../storage/vector-store/vector-store.interface.js';
import {
  VECTOR_STORE,
  type VectorStore,
} from '../../storage/vector-store/vector-store.interface.js';
import { createRunDir, gitSha, percentile, writeJson } from '../run-context.js';

export interface EvalLoadOptions {
  dataset: string;
  label: string;
  // Concurrent workers per level, e.g. [1, 2, 4, 8].
  workers: number[];
  // Passes over the queries at each level.
  rounds: number;
}

// Throughput of the local part of the RAG path (context building: embedding,
// dense and BM25 search, fusion, fetch, reranking) under concurrent requests,
// with each query's cached classification filter. No LLM call is made, so the
// figures are the ceiling the self-hosted stages impose; the hosted
// classifier and generator scale on the provider's side.
export async function evalLoad(
  app: INestApplicationContext,
  options: EvalLoadOptions,
): Promise<string> {
  const logger = new Logger('eval:load');
  const rag = app.get(RagService);
  const store = app.get<VectorStore>(VECTOR_STORE);
  const config = app.get(ConfigService);
  const classifications = new ClassificationCache(
    app.get(QueryClassifierService),
    app.get(LlmService).modelName,
  );
  const queries = loadDataset(options.dataset).filter(
    (q) => q.category !== 'aggregation',
  );
  const filters = new Map<string, VectorFilter | undefined>();
  for (const q of queries)
    filters.set(q.id, await classifications.filterFor(q.text));

  // Warm-up pass, discarded (model kernels, connection pools, BM25 index).
  for (const q of queries) await rag.buildContext(q.text, filters.get(q.id));

  const dir = createRunDir(`load-${store.backend}-${options.label}`);
  const records: string[] = [];
  const levels = [];
  for (const workers of options.workers) {
    const tasks = Array.from({ length: options.rounds }, () => queries).flat();
    const latencies: number[] = [];
    let next = 0;
    let empty = 0;
    const t0 = performance.now();
    await Promise.all(
      Array.from({ length: workers }, async (_, worker) => {
        while (next < tasks.length) {
          const q = tasks[next++];
          const s = performance.now();
          const ctx = await rag.buildContext(q.text, filters.get(q.id));
          const ms = performance.now() - s;
          if (!ctx) empty++;
          latencies.push(ms);
          records.push(JSON.stringify({ workers, worker, queryId: q.id, ms }));
        }
      }),
    );
    const wallMs = performance.now() - t0;
    const level = {
      workers,
      requests: tasks.length,
      emptyContexts: empty,
      wallMs,
      queriesPerSecond: tasks.length / (wallMs / 1000),
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
    };
    levels.push(level);
    logger.log(
      `${workers} workers: ${level.queriesPerSecond.toFixed(1)} q/s, ` +
        `p50 ${level.p50Ms.toFixed(0)} ms, p95 ${level.p95Ms.toFixed(0)} ms`,
    );
  }

  writeFileSync(join(dir, 'load.jsonl'), records.join('\n') + '\n');
  copyFileSync(options.dataset, join(dir, 'queries.jsonl'));
  writeJson(dir, 'config.json', {
    command: 'eval:load',
    gitSha: gitSha(),
    createdAt: new Date().toISOString(),
    vectorBackend: store.backend,
    retrievalHybrid: config.get<string>('RETRIEVAL_HYBRID', 'true') === 'true',
    rerankEnabled: config.get<string>('RERANK_ENABLED', 'true') === 'true',
    queries: queries.length,
    ...options,
  });
  writeJson(dir, 'summary.json', { levels });
  logger.log(`Written to ${dir}`);
  return dir;
}
