import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { copyFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';
import { ClassificationCache } from '../../eval/classification-cache.js';
import { loadDataset, type EvalQuery } from '../../eval/dataset.js';
import { type ChatMessage, LlmService } from '../../llm/llm.service.js';
import { toVectorFilter } from '../../query/job-filters.js';
import {
  QueryClassifierService,
  type ClassificationResult,
} from '../../query/query-classifier.service.js';
import { RagService } from '../../rag/rag.service.js';
import {
  VECTOR_STORE,
  type VectorStore,
} from '../../storage/vector-store/vector-store.interface.js';
import {
  createRunDir,
  gitSha,
  mulberry32,
  percentile,
  writeJson,
} from '../run-context.js';

export interface EvalLatencyOptions {
  dataset: string;
  label: string;
  warmup: number;
  repetitions: number;
  generationQueries: number;
  generationRepetitions: number;
  temperature: number;
  delayMs: number;
  seed: number;
}

// Fixed subset for the generation measurements: a seeded shuffle within each
// category, then taken round-robin across categories.
function stratifiedSample(
  queries: EvalQuery[],
  n: number,
  seed: number,
): EvalQuery[] {
  const random = mulberry32(seed);
  const byCategory = new Map<string, EvalQuery[]>();
  for (const q of queries) {
    byCategory.set(q.category, [...(byCategory.get(q.category) ?? []), q]);
  }
  const shuffled = [...byCategory.values()].map((qs) =>
    qs
      .map((q) => ({ q, r: random() }))
      .sort((a, b) => a.r - b.r)
      .map((e) => e.q),
  );
  const sample: EvalQuery[] = [];
  for (
    let i = 0;
    sample.length < n && shuffled.some((qs) => i < qs.length);
    i++
  ) {
    for (const qs of shuffled) {
      if (i < qs.length && sample.length < n) sample.push(qs[i]);
    }
  }
  return sample;
}

const RATE_LIMIT_WAIT_MS = 60_000;
const MAX_RATE_LIMIT_RETRIES = 10;

function isRateLimited(err: unknown): boolean {
  const e = err as { status?: number; getStatus?: () => number };
  return e.status === 429 || e.getStatus?.() === 429;
}

// One timed streaming generation. A rate-limited call is waited out and
// measured again from scratch, since these measurements have no cache to
// resume from.
async function timedGeneration(
  llm: LlmService,
  messages: ChatMessage[],
  temperature: number,
  logger: Logger,
): Promise<{ ttftMs: number; generationMs: number; chars: number }> {
  for (let attempt = 0; ; attempt++) {
    try {
      const g0 = performance.now();
      let ttftMs = -1;
      let chars = 0;
      for await (const token of llm.completeChatStream(messages, {
        temperature,
      })) {
        if (ttftMs < 0) ttftMs = performance.now() - g0;
        chars += token.length;
      }
      return { ttftMs, generationMs: performance.now() - g0, chars };
    } catch (err) {
      if (!isRateLimited(err) || attempt >= MAX_RATE_LIMIT_RETRIES) throw err;
      logger.warn(`Rate limited; retrying in ${RATE_LIMIT_WAIT_MS / 1000}s`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS));
    }
  }
}

// The classification as production runs it (no cache), timed. Rate-limited
// calls are waited out and measured again from scratch.
async function timedClassification(
  classifier: QueryClassifierService,
  query: string,
  logger: Logger,
): Promise<{ classifyMs: number; result: ClassificationResult }> {
  for (let attempt = 0; ; attempt++) {
    try {
      const t0 = performance.now();
      const result = await classifier.classify(query, { strict: true });
      return { classifyMs: performance.now() - t0, result };
    } catch (err) {
      if (!isRateLimited(err) || attempt >= MAX_RATE_LIMIT_RETRIES) throw err;
      logger.warn(`Rate limited; retrying in ${RATE_LIMIT_WAIT_MS / 1000}s`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS));
    }
  }
}

function stats(values: number[]) {
  return {
    n: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
  };
}

// Per-stage latency of the RAG path served by the configured vector store
// (VECTOR_BACKEND). Local stages run every retrieval query `repetitions` times
// after `warmup` discarded runs, with the query's cached classification
// filter. Classification and generation, which depend on the hosted LLM, run
// a fixed subset a few times without any cache.
export async function evalLatency(
  app: INestApplicationContext,
  options: EvalLatencyOptions,
): Promise<string> {
  const logger = new Logger('eval:latency');
  const rag = app.get(RagService);
  const llm = app.get(LlmService);
  const store = app.get<VectorStore>(VECTOR_STORE);
  const classifier = app.get(QueryClassifierService);
  const classifications = new ClassificationCache(classifier, llm.modelName);
  const queries = loadDataset(options.dataset).filter(
    (q) => q.category !== 'aggregation',
  );
  const dir = createRunDir(`latency-${store.backend}-${options.label}`);
  const records: string[] = [];

  const local: Record<string, number[]> = {
    embedMs: [],
    denseMs: [],
    bm25Ms: [],
    fuseMs: [],
    fetchMs: [],
    rerankMs: [],
    contextMs: [],
  };
  let emptyContexts = 0;
  for (const q of queries) {
    const filter = await classifications.filterFor(q.text);
    for (let i = 0; i < options.warmup + options.repetitions; i++) {
      const t0 = performance.now();
      const ctx = await rag.buildContext(q.text, filter);
      const contextMs = performance.now() - t0;
      if (i < options.warmup) continue;
      if (!ctx) {
        emptyContexts++;
        continue;
      }
      for (const [stage, ms] of Object.entries(ctx.timings) as Array<
        [string, number]
      >) {
        local[stage].push(ms);
      }
      local.contextMs.push(contextMs);
      records.push(
        JSON.stringify({
          kind: 'context',
          queryId: q.id,
          rep: i - options.warmup,
          ...ctx.timings,
          contextMs,
        }),
      );
    }
    logger.log(`${q.id}: ${options.repetitions} context runs`);
  }

  const generation: Record<string, number[]> = {
    classifyMs: [],
    ttftMs: [],
    generationMs: [],
    perceivedTtftMs: [],
    totalMs: [],
  };
  const subset = stratifiedSample(
    queries,
    options.generationQueries,
    options.seed,
  );
  for (const q of subset) {
    for (let rep = 0; rep < options.generationRepetitions; rep++) {
      const { classifyMs, result } = await timedClassification(
        classifier,
        q.text,
        logger,
      );
      const t0 = performance.now();
      const ctx = await rag.buildContext(
        q.text,
        toVectorFilter(result.filters),
      );
      const contextMs = performance.now() - t0;
      if (!ctx) break;
      const messages = rag.buildMessages(ctx.systemMessage, [], q.text);
      const { ttftMs, generationMs, chars } = await timedGeneration(
        llm,
        messages,
        options.temperature,
        logger,
      );
      generation.classifyMs.push(classifyMs);
      generation.ttftMs.push(ttftMs);
      generation.generationMs.push(generationMs);
      generation.perceivedTtftMs.push(classifyMs + contextMs + ttftMs);
      generation.totalMs.push(classifyMs + contextMs + generationMs);
      records.push(
        JSON.stringify({
          kind: 'generation',
          queryId: q.id,
          rep,
          classifyMs,
          contextMs,
          ttftMs,
          generationMs,
          chars,
        }),
      );
      if (options.delayMs > 0)
        await new Promise((r) => setTimeout(r, options.delayMs));
    }
    logger.log(`${q.id}: ${options.generationRepetitions} generations`);
  }

  const summary = {
    local: Object.fromEntries(
      Object.entries(local).map(([k, v]) => [k, stats(v)]),
    ),
    generation: Object.fromEntries(
      Object.entries(generation).map(([k, v]) => [k, stats(v)]),
    ),
    emptyContexts,
  };
  writeFileSync(join(dir, 'latency.jsonl'), records.join('\n') + '\n');
  copyFileSync(options.dataset, join(dir, 'queries.jsonl'));
  writeJson(dir, 'summary.json', summary);
  writeJson(dir, 'config.json', {
    command: 'eval:latency',
    gitSha: gitSha(),
    createdAt: new Date().toISOString(),
    vectorBackend: store.backend,
    model: llm.modelName,
    classifier: classifications.version,
    queries: queries.length,
    generationSubset: subset.map((q) => q.id),
    ...options,
  });
  logger.log(`latency (${store.backend}) → ${dir}`);
  return dir;
}
