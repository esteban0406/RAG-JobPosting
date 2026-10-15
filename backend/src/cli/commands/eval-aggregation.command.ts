import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { copyFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  compareRows,
  normalizeRow,
  type SqlRow,
} from '../../eval/aggregation-compare.js';
import { ClassificationCache } from '../../eval/classification-cache.js';
import { loadDataset } from '../../eval/dataset.js';
import { LlmService } from '../../llm/llm.service.js';
import { AggregationService } from '../../query/aggregation/aggregation.service.js';
import type { TemplateKey } from '../../query/aggregation/query-templates.js';
import { QueryClassifierService } from '../../query/query-classifier.service.js';
import { PrismaService } from '../../storage/prisma.service.js';
import { createRunDir, gitSha, writeJson } from '../run-context.js';
import { retryRateLimited } from '../rate-limit.js';

export interface EvalAggregationOptions {
  dataset: string;
  label: string;
  delayMs: number;
}

// Routes every aggregation query through the production classifier and
// compares the rows the chosen template returns with a hand-written reference
// query. Rows are compared rather than the LLM's summary so the check is
// deterministic.
export async function evalAggregation(
  app: INestApplicationContext,
  options: EvalAggregationOptions,
): Promise<string> {
  const logger = new Logger('eval:aggregation');
  const classifier = app.get(QueryClassifierService);
  const aggregation = app.get(AggregationService);
  const prisma = app.get(PrismaService);
  const llm = app.get(LlmService);
  const classifications = new ClassificationCache(classifier, llm.modelName);
  const queries = loadDataset(options.dataset).filter(
    (q) => q.category === 'aggregation',
  );

  const dir = createRunDir(`aggregation-${options.label}`);
  const results: Array<{
    routeCorrect: boolean;
    exact: boolean;
    coverage: number;
  }> = [];
  const lines: string[] = [];
  for (const q of queries) {
    if (!q.goldSql || !q.expectedTemplates?.length)
      throw new Error(`${q.id}: missing goldSql or expectedTemplates`);

    // Cached and strict (shared with the other commands): a rate-limited call
    // must not count as a routing error.
    const c = await retryRateLimited(
      () => classifications.classify(q.text),
      logger,
    );
    const routeCorrect =
      c.type === q.expectedRoute &&
      q.expectedTemplates.includes(c.intent as TemplateKey);

    // Same dispatch as QueryOrchestratorService: a template runs as-is;
    // retrieval, including filter_jobs (retrieval with filters), gets no rows.
    let systemRows: SqlRow[] = [];
    let error: string | null = null;
    try {
      if (c.intent && c.intent !== 'filter_jobs' && c.type !== 'retrieval') {
        systemRows = await aggregation.queryRaw(c.intent, c.params ?? []);
      }
    } catch (err) {
      error = (err as Error).message;
    }
    const goldRows = await prisma.$queryRawUnsafe<SqlRow[]>(q.goldSql);
    const comparison = compareRows(systemRows, goldRows);
    results.push({ routeCorrect, ...comparison });

    lines.push(
      JSON.stringify({
        queryId: q.id,
        question: q.text,
        expectedRoute: q.expectedRoute,
        expectedTemplates: q.expectedTemplates,
        route: c.type,
        intent: c.intent ?? null,
        params: c.params ?? null,
        filters: c.filters ?? null,
        routeCorrect,
        ...comparison,
        error,
        systemRows: systemRows.map(normalizeRow),
        goldRows: goldRows.map(normalizeRow),
      }),
    );
    logger.log(
      `${q.id}: ${c.type}/${c.intent ?? '-'} route ${routeCorrect ? 'ok' : 'wrong'}, ` +
        `rows ${comparison.coveredRows}/${comparison.goldRows}`,
    );
    if (options.delayMs > 0)
      await new Promise((r) => setTimeout(r, options.delayMs));
  }

  const n = results.length;
  const summary = {
    queries: n,
    routingAccuracy: results.filter((r) => r.routeCorrect).length / n,
    answerExact: results.filter((r) => r.exact).length / n,
    meanCoverage: results.reduce((s, r) => s + r.coverage, 0) / n,
  };
  writeFileSync(join(dir, 'results.jsonl'), lines.join('\n') + '\n');
  copyFileSync(options.dataset, join(dir, 'queries.jsonl'));
  writeJson(dir, 'config.json', {
    command: 'eval:aggregation',
    gitSha: gitSha(),
    createdAt: new Date().toISOString(),
    model: llm.modelName,
    classifier: classifications.version,
    ...summary,
    ...options,
  });
  logger.log(
    `routing ${summary.routingAccuracy.toFixed(3)}, exact ${summary.answerExact.toFixed(3)}, ` +
      `coverage ${summary.meanCoverage.toFixed(3)} → ${dir}`,
  );
  return dir;
}
