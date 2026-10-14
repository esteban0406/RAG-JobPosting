import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { copyFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';
import { EmbeddingService } from '../../embedding/embedding.service.js';
import { ClassificationCache } from '../../eval/classification-cache.js';
import { loadDataset } from '../../eval/dataset.js';
import { Bm25System } from '../../eval/systems/bm25.system.js';
import {
  DenseSystem,
  memoizedEmbedder,
} from '../../eval/systems/dense.system.js';
import { IlikeSystem } from '../../eval/systems/ilike.system.js';
import { PipelineSystem } from '../../eval/systems/pipeline.system.js';
import { LlmService } from '../../llm/llm.service.js';
import { QueryClassifierService } from '../../query/query-classifier.service.js';
import { RetrievalPipeline } from '../../retrieval/retrieval-pipeline.service.js';
import type {
  RetrievalSystem,
  RetrievedJob,
} from '../../eval/systems/retrieval-system.js';
import { writeTrecRun } from '../../eval/trec.js';
import { JobRepository } from '../../storage/job.repository.js';
import { PrismaService } from '../../storage/prisma.service.js';
import { PgVectorStore } from '../../storage/vector-store/pgvector.store.js';
import { QdrantVectorStore } from '../../storage/vector-store/qdrant.store.js';
import { createRunDir, gitSha, writeJson } from '../run-context.js';

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
}

// The same configuration with a few keys replaced.
function withOverrides(
  config: ConfigService,
  overrides: Record<string, string>,
): ConfigService {
  return {
    get: (key: string, fallback?: unknown) =>
      overrides[key] ?? config.get<unknown>(key) ?? fallback,
    getOrThrow: (key: string) =>
      overrides[key] ?? config.getOrThrow<unknown>(key),
  } as unknown as ConfigService;
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

  const factories: Record<string, () => Promise<RetrievalSystem>> = {
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
  for (const name of options.systems) {
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
    const empty = [...results.values()].filter((r) => r.length === 0).length;
    logger.log(`${name}: ${queries.length} queries, ${empty} with no results`);
  }
  writeFileSync(join(dir, 'latency.jsonl'), latencies.join('\n') + '\n');
  copyFileSync(options.dataset, join(dir, 'queries.jsonl'));
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
    corpus: { jobs: jobCount, chunks },
    queries: queries.length,
    ...options,
  });
  logger.log(`Run written to ${dir}`);
  return dir;
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
