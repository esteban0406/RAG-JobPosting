import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appendFileSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';
import { EmbeddingService } from '../../embedding/embedding.service.js';
import { ClassificationCache } from '../../eval/classification-cache.js';
import { complianceAtK } from '../../eval/compliance.js';
import { loadDataset, sameFilter, type EvalQuery } from '../../eval/dataset.js';
import { Bm25System } from '../../eval/systems/bm25.system.js';
import {
  DenseSystem,
  memoizedEmbedder,
} from '../../eval/systems/dense.system.js';
import { IlikeSystem } from '../../eval/systems/ilike.system.js';
import { PipelineSystem } from '../../eval/systems/pipeline.system.js';
import { LlmService } from '../../llm/llm.service.js';
import { QueryClassifierService } from '../../query/query-classifier.service.js';
import type { FilterableJob } from '../../retrieval/job-filter.js';
import { RerankService } from '../../retrieval/rerank.service.js';
import {
  RetrievalPipeline,
  type RerankFusion,
} from '../../retrieval/retrieval-pipeline.service.js';
import type {
  RetrievalSystem,
  RetrievedJob,
} from '../../eval/systems/retrieval-system.js';
import { writeTrecRun } from '../../eval/trec.js';
import { JobRepository } from '../../storage/job.repository.js';
import { PrismaService } from '../../storage/prisma.service.js';
import { PgVectorStore } from '../../storage/vector-store/pgvector.store.js';
import { QdrantVectorStore } from '../../storage/vector-store/qdrant.store.js';
import {
  createRunDir,
  gitSha,
  withOverrides,
  writeJson,
} from '../run-context.js';

// Baselines, the embedding-model ablation, the three dense engines and the
// ablation ladder of the production pipeline (each rung adds one component).
export const SYSTEM_NAMES = [
  'ilike',
  'bm25',
  'qdrant-e5base',
  'pg-exact',
  'pg-hnsw',
  'qdrant-hnsw',
  'qdrant-filtered',
  'qdrant-hybrid',
  'qdrant-hybrid-rerank',
] as const;

export interface EvalRetrieveOptions {
  dataset: string;
  systems: string[];
  depth: number;
  efSearch: number;
  label: string;
  // e5-base-v2 vectors and query server for the qdrant-e5base system.
  ablationCollection: string;
  ablationEmbedUrl: string;
  // JSON file of reranker variants, each run as an extra system.
  variants?: string;
}

// A configuration of the full pipeline (filters, hybrid, reranking) that
// differs only in its reranker; compared on the development set.
export interface RerankVariant {
  name: string;
  rerankerUrl?: string;
  instruction?: string;
  fusion?: RerankFusion;
  candidates?: number;
}

export function loadVariants(path: string): RerankVariant[] {
  const variants = JSON.parse(readFileSync(path, 'utf8')) as RerankVariant[];
  for (const v of variants) {
    if (!v.name || (SYSTEM_NAMES as readonly string[]).includes(v.name)) {
      throw new Error(`Variant name "${v.name}" is missing or taken`);
    }
    if (v.fusion && v.fusion !== 'replace' && v.fusion !== 'rrf') {
      throw new Error(`${v.name}: unknown fusion "${v.fusion as string}"`);
    }
  }
  return variants;
}

// Runs every retrieval system over the non-aggregation queries and writes one
// TREC run file per system plus per-query retrieval latency.
export async function evalRetrieve(
  app: INestApplicationContext,
  options: EvalRetrieveOptions,
): Promise<string> {
  const logger = new Logger('eval:retrieve');
  const queries = loadDataset(options.dataset).filter(
    (q) => q.category !== 'aggregation',
  );
  const jobs = app.get(JobRepository);
  const embedding = app.get(EmbeddingService);
  const embed = memoizedEmbedder((text) => embedding.embedQuery(text));
  const config = app.get(ConfigService);
  const qdrantPipeline = app
    .get(RetrievalPipeline)
    .withStore(app.get(QdrantVectorStore));
  const classifications = new ClassificationCache(
    app.get(QueryClassifierService),
    app.get(LlmService).modelName,
  );
  const filterFor = (query: string) => classifications.filterFor(query);
  const ann = { mode: 'ann' as const, efSearch: options.efSearch };
  const pipelineSystem = (name: string, hybrid: boolean, rerank: boolean) =>
    Promise.resolve(
      new PipelineSystem(name, qdrantPipeline, embed, {
        hybrid,
        rerank,
        filterFor,
        search: ann,
      }),
    );

  const variants = options.variants ? loadVariants(options.variants) : [];
  const variantSystems = Object.fromEntries(
    variants.map((v) => [
      v.name,
      () => {
        const reranker = new RerankService(
          withOverrides(config, {
            ...(v.rerankerUrl && { RERANKER_URL: v.rerankerUrl }),
            RERANK_INSTRUCTION: v.instruction ?? '',
          }),
        );
        return Promise.resolve<RetrievalSystem>(
          new PipelineSystem(
            v.name,
            qdrantPipeline.withReranker(reranker),
            embed,
            {
              hybrid: true,
              rerank: true,
              filterFor,
              search: ann,
              rerankFusion: v.fusion,
              rerankCandidates: v.candidates,
            },
          ),
        );
      },
    ]),
  );

  const factories: Record<string, () => Promise<RetrievalSystem>> = {
    ...variantSystems,
    ilike: () => Promise.resolve(new IlikeSystem(jobs)),
    bm25: async () => new Bm25System(await jobs.findAllUnpaged()),
    'qdrant-e5base': () => {
      const ablation = withOverrides(config, {
        QDRANT_COLLECTION: options.ablationCollection,
        LOCAL_EMBEDDING_URL: options.ablationEmbedUrl,
        LOCAL_EMBEDDING_MODEL: 'e5-base-v2',
      });
      const e5 = new EmbeddingService(ablation, app.get(CACHE_MANAGER));
      const store = new QdrantVectorStore(app.get(PgVectorStore), ablation);
      return Promise.resolve(
        new DenseSystem(
          'qdrant-e5base',
          store,
          memoizedEmbedder((text) => e5.embedQuery(text)),
          ann,
        ),
      );
    },
    'pg-exact': () =>
      Promise.resolve(
        new DenseSystem('pg-exact', app.get(PgVectorStore), embed, {
          mode: 'exact',
        }),
      ),
    'pg-hnsw': () =>
      Promise.resolve(
        new DenseSystem('pg-hnsw', app.get(PgVectorStore), embed, {
          mode: 'ann',
          efSearch: options.efSearch,
        }),
      ),
    'qdrant-hnsw': () =>
      Promise.resolve(
        new DenseSystem('qdrant-hnsw', app.get(QdrantVectorStore), embed, {
          mode: 'ann',
          efSearch: options.efSearch,
        }),
      ),
    'qdrant-filtered': () => pipelineSystem('qdrant-filtered', false, false),
    'qdrant-hybrid': () => pipelineSystem('qdrant-hybrid', true, false),
    'qdrant-hybrid-rerank': () =>
      pipelineSystem('qdrant-hybrid-rerank', true, true),
  };

  // Embed up front so the measured latency is retrieval only.
  for (const q of queries) await embed(q.text);

  const dir = createRunDir(`retrieve-${options.label}`);
  const latencies: string[] = [];
  const runs = new Map<string, Map<string, RetrievedJob[]>>();
  for (const name of [...options.systems, ...variants.map((v) => v.name)]) {
    const factory = factories[name];
    if (!factory)
      throw new Error(
        `Unknown system "${name}" (known: ${SYSTEM_NAMES.join(', ')})`,
      );
    const system = await factory();
    const results = new Map<string, RetrievedJob[]>();
    for (const q of queries) {
      const t0 = performance.now();
      results.set(q.id, await system.retrieve(q.text, options.depth));
      latencies.push(
        JSON.stringify({
          system: name,
          queryId: q.id,
          ms: performance.now() - t0,
        }),
      );
    }
    writeTrecRun(join(dir, `${name}.trec`), name, results);
    runs.set(name, results);
    // Highest rerank probability per query, to calibrate a no-results
    // threshold (TREC scores are RRF scores under rrf fusion).
    const top = [...results].flatMap(([queryId, jobs]) => {
      const scores = jobs.flatMap((j) =>
        j.rerankScore === undefined ? [] : [j.rerankScore],
      );
      return scores.length
        ? [JSON.stringify({ system: name, queryId, top: Math.max(...scores) })]
        : [];
    });
    if (top.length > 0) {
      appendFileSync(join(dir, 'rerank-top.jsonl'), top.join('\n') + '\n');
    }
    const empty = [...results.values()].filter((r) => r.length === 0).length;
    logger.log(`${name}: ${queries.length} queries, ${empty} with no results`);
  }
  writeFileSync(join(dir, 'latency.jsonl'), latencies.join('\n') + '\n');
  copyFileSync(options.dataset, join(dir, 'queries.jsonl'));
  // Constraint extraction against the dataset, when a filtered system ran
  // (the classifications are already cached, so this makes no LLM calls).
  let filterExtraction: { scored: number; exact: number } | null = null;
  if (classifications.usedEntries().length > 0) {
    const rows: string[] = [];
    let exact = 0;
    const scored = queries.filter((q) => q.expectedFilters !== undefined);
    for (const q of scored) {
      const extracted = (await classifications.filterFor(q.text)) ?? {};
      const match = sameFilter(q.expectedFilters, extracted);
      if (match) exact++;
      rows.push(
        JSON.stringify({
          queryId: q.id,
          expected: q.expectedFilters,
          extracted,
          exact: match,
        }),
      );
    }
    writeFileSync(join(dir, 'filters.jsonl'), rows.join('\n') + '\n');
    filterExtraction = { scored: scored.length, exact };
    logger.log(`Filter extraction: ${exact}/${scored.length} exact`);
  }

  const constraintCompliance = await writeCompliance(dir, queries, runs, jobs);

  const used = classifications.usedEntries();
  if (used.length > 0) {
    writeFileSync(
      join(dir, 'classifications.jsonl'),
      used.map((e) => JSON.stringify(e)).join('\n') + '\n',
    );
  }

  const prisma = app.get(PrismaService);
  const [{ jobs: jobCount, chunks }] = await prisma.$queryRaw<
    [{ jobs: number; chunks: number }]
  >`
    SELECT (SELECT count(*)::int FROM "Job") AS jobs,
           (SELECT count(*)::int FROM "JobChunk" WHERE embedding IS NOT NULL) AS chunks
  `;
  writeJson(dir, 'config.json', {
    command: 'eval:retrieve',
    gitSha: gitSha(),
    createdAt: new Date().toISOString(),
    embeddingModel: embedding.modelName,
    embeddingServer: await serverInfo(config),
    classifier: used.length > 0 ? classifications.version : null,
    filterExtraction,
    constraintCompliance,
    variants,
    corpus: { jobs: jobCount, chunks },
    queries: queries.length,
    ...options,
  });
  logger.log(`Run written to ${dir}`);
  return dir;
}

// For queries that state a constraint, the share of each system's top 5 and
// top 10 that meets it, read from the job attributes (judge-free).
async function writeCompliance(
  dir: string,
  queries: EvalQuery[],
  runs: Map<string, Map<string, RetrievedJob[]>>,
  jobRepo: JobRepository,
): Promise<Record<string, { queries: number; at5: number; at10: number }>> {
  const constrained = queries.filter(
    (q) => q.expectedFilters && Object.keys(q.expectedFilters).length > 0,
  );
  if (constrained.length === 0) return {};
  const jobs = new Map<string, FilterableJob>(
    (await jobRepo.findAllUnpaged()).map((j) => [j.id, j]),
  );
  const rows: string[] = [];
  const summary: Record<
    string,
    { queries: number; at5: number; at10: number }
  > = {};
  for (const [system, results] of runs) {
    const at5: number[] = [];
    const at10: number[] = [];
    for (const q of constrained) {
      const ids = (results.get(q.id) ?? []).map((r) => r.jobId);
      const c5 = complianceAtK(ids, jobs, q.expectedFilters!, 5);
      const c10 = complianceAtK(ids, jobs, q.expectedFilters!, 10);
      if (c5 !== null) at5.push(c5);
      if (c10 !== null) at10.push(c10);
      rows.push(
        JSON.stringify({
          system,
          queryId: q.id,
          returned: ids.length,
          at5: c5,
          at10: c10,
        }),
      );
    }
    const mean = (v: number[]) =>
      v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    summary[system] = { queries: at5.length, at5: mean(at5), at10: mean(at10) };
  }
  writeFileSync(join(dir, 'compliance.jsonl'), rows.join('\n') + '\n');
  return summary;
}

// Models and device reported by the embedding/reranking server.
async function serverInfo(config: ConfigService): Promise<unknown> {
  const url = config.get<string>(
    'LOCAL_EMBEDDING_URL',
    'http://localhost:8000',
  );
  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
