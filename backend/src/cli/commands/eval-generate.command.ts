import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import { performance } from 'perf_hooks';
import { ClassificationCache } from '../../eval/classification-cache.js';
import { loadDataset } from '../../eval/dataset.js';
import { LlmService } from '../../llm/llm.service.js';
import { QueryClassifierService } from '../../query/query-classifier.service.js';
import { RagService } from '../../rag/rag.service.js';
import {
  VECTOR_STORE,
  type VectorStore,
} from '../../storage/vector-store/vector-store.interface.js';
import { retryRateLimited } from '../rate-limit.js';
import { createRunDir, gitSha, writeJson } from '../run-context.js';

export interface EvalGenerateOptions {
  dataset: string;
  label: string;
  temperature: number;
  delayMs: number;
  limit?: number;
}

interface CachedAnswer {
  key: string;
  model: string;
  temperature: number;
  answer: string;
  ttftMs: number;
  generationMs: number;
  generatedAt: string;
}

// Answers every retrieval query through the production RAG path (no user, so
// no resume personalization), with the filters the classifier extracts from
// each query (cached, shared with eval:retrieve), and records the contexts the LLM saw, the answer
// and per-stage timings. Answers are cached by model, temperature and exact
// messages, because hosted models can be retired at any time.
export async function evalGenerate(
  app: INestApplicationContext,
  options: EvalGenerateOptions,
): Promise<string> {
  const logger = new Logger('eval:generate');
  const rag = app.get(RagService);
  const llm = app.get(LlmService);
  const store = app.get<VectorStore>(VECTOR_STORE);
  const classifications = new ClassificationCache(
    app.get(QueryClassifierService),
    llm.modelName,
  );
  const queries = loadDataset(options.dataset)
    .filter((q) => q.category !== 'aggregation')
    .slice(0, options.limit);

  const cachePath = resolve(
    process.cwd(),
    '..',
    'evaluation',
    'generations',
    `${llm.modelName.replace(/[^a-zA-Z0-9.-]+/g, '_')}.jsonl`,
  );
  const cache = new Map<string, CachedAnswer>();
  if (existsSync(cachePath)) {
    for (const line of readFileSync(cachePath, 'utf8')
      .split('\n')
      .filter(Boolean)) {
      const entry = JSON.parse(line) as CachedAnswer;
      cache.set(entry.key, entry);
    }
  }

  const dir = createRunDir(`generate-${options.label}`);
  const lines: string[] = [];
  let fresh = 0;
  for (const q of queries) {
    const filter = await classifications.filterFor(q.text);
    const t0 = performance.now();
    const ctx = await rag.buildContext(q.text, filter);
    const contextMs = performance.now() - t0;
    if (!ctx) {
      lines.push(
        JSON.stringify({
          queryId: q.id,
          question: q.text,
          contexts: [],
          answer: null,
        }),
      );
      continue;
    }

    const messages = rag.buildMessages(ctx.systemMessage, [], q.text);
    const key = createHash('sha256')
      .update(JSON.stringify([llm.modelName, options.temperature, messages]))
      .digest('hex');
    const cached = cache.get(key);
    let entry = cached;
    if (!entry) {
      const generated = await retryRateLimited(async () => {
        const g0 = performance.now();
        let ttftMs = -1;
        let answer = '';
        for await (const token of llm.completeChatStream(messages, {
          temperature: options.temperature,
        })) {
          if (ttftMs < 0) ttftMs = performance.now() - g0;
          answer += token;
        }
        return { answer, ttftMs, generationMs: performance.now() - g0 };
      }, logger);
      entry = {
        key,
        model: llm.modelName,
        temperature: options.temperature,
        ...generated,
        generatedAt: new Date().toISOString(),
      };
      mkdirSync(dirname(cachePath), { recursive: true });
      appendFileSync(cachePath, JSON.stringify(entry) + '\n');
      cache.set(key, entry);
      fresh++;
      if (options.delayMs > 0)
        await new Promise((r) => setTimeout(r, options.delayMs));
    }

    lines.push(
      JSON.stringify({
        queryId: q.id,
        question: q.text,
        lang: q.lang,
        category: q.category,
        filter: filter ?? null,
        filterRelaxed: ctx.filterRelaxed,
        contexts: ctx.contexts,
        sources: ctx.sources.map((s) => s.jobId),
        answer: entry.answer,
        model: entry.model,
        generatedAt: entry.generatedAt,
        timings: {
          ...ctx.timings,
          contextMs,
          ttftMs: entry.ttftMs,
          generationMs: entry.generationMs,
        },
      }),
    );
    logger.log(
      `${q.id}: ${entry.answer.length} chars${cached ? ' (cached)' : ''}`,
    );
  }

  writeFileSync(join(dir, 'answers.jsonl'), lines.join('\n') + '\n');
  copyFileSync(options.dataset, join(dir, 'queries.jsonl'));
  writeJson(dir, 'config.json', {
    command: 'eval:generate',
    gitSha: gitSha(),
    createdAt: new Date().toISOString(),
    model: llm.modelName,
    classifier: classifications.version,
    vectorBackend: store.backend,
    queries: queries.length,
    newlyGenerated: fresh,
    ...options,
  });
  logger.log(`${queries.length} answers (${fresh} new) → ${dir}`);
  return dir;
}
