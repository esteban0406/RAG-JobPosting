import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { performance } from 'perf_hooks';
import { EmbeddingService } from '../../embedding/embedding.service.js';
import { PrismaService } from '../../storage/prisma.service.js';
import { PgVectorStore } from '../../storage/vector-store/pgvector.store.js';
import { QdrantVectorStore } from '../../storage/vector-store/qdrant.store.js';
import type {
  SearchOptions,
  VectorStore,
} from '../../storage/vector-store/vector-store.interface.js';
import { createRunDir, gitSha, percentile, writeJson } from '../run-context.js';

export interface AnnQuickOptions {
  queries: number;
  k: number;
  efValues: number[];
  repetitions: number;
}

interface SystemResult {
  system: string;
  backend: string;
  mode: string;
  efSearch: number | null;
  recallAtK: number;
  p50Ms: number;
  p95Ms: number;
  meanMs: number;
}

// Quick recall/latency comparison on the real corpus: pgvector exact search
// is the ground truth; pgvector HNSW and Qdrant HNSW are swept over ef_search.
// The thorough benchmark (synthetic scale, filters) lives in evaluation/bench.
export async function annQuick(
  app: INestApplicationContext,
  options: AnnQuickOptions,
): Promise<void> {
  const logger = new Logger('ann:quick');
  const prisma = app.get(PrismaService);
  const embedding = app.get(EmbeddingService);
  const pg = app.get(PgVectorStore);
  const qdrant = app.get(QdrantVectorStore);

  // Deterministic sample of distinct job titles used as queries.
  const titles = await prisma.$queryRaw<Array<{ title: string }>>`
    SELECT title FROM (SELECT DISTINCT title FROM "Job") t
    ORDER BY md5(title) LIMIT ${options.queries}
  `;
  logger.log(`Embedding ${titles.length} title queries`);
  const vectors: number[][] = [];
  for (const { title } of titles) {
    vectors.push(await embedding.embedQuery(title));
  }

  const k = options.k;
  const groundTruth: Array<Set<string>> = [];
  for (const v of vectors) {
    const rows = await pg.search(v, { topK: k, mode: 'exact' });
    groundTruth.push(new Set(rows.map((r) => r.id)));
  }

  const systems: Array<{
    name: string;
    store: VectorStore;
    opts: Omit<SearchOptions, 'topK'>;
  }> = [
    { name: 'pg-exact', store: pg, opts: { mode: 'exact' } },
    { name: 'qdrant-exact', store: qdrant, opts: { mode: 'exact' } },
    { name: 'pg-auto', store: pg, opts: { mode: 'auto' } },
  ];
  for (const ef of options.efValues) {
    systems.push({
      name: `pg-hnsw-ef${ef}`,
      store: pg,
      opts: { mode: 'ann', efSearch: ef },
    });
    systems.push({
      name: `qdrant-hnsw-ef${ef}`,
      store: qdrant,
      opts: { mode: 'ann', efSearch: ef },
    });
  }

  const results: SystemResult[] = [];
  for (const system of systems) {
    // Warm-up pass, also used to score recall.
    let hits = 0;
    for (let i = 0; i < vectors.length; i++) {
      const rows = await system.store.search(vectors[i], {
        topK: k,
        ...system.opts,
      });
      hits += rows.filter((r) => groundTruth[i].has(r.id)).length;
    }

    const latencies: number[] = [];
    for (let rep = 0; rep < options.repetitions; rep++) {
      for (const v of vectors) {
        const t0 = performance.now();
        await system.store.search(v, { topK: k, ...system.opts });
        latencies.push(performance.now() - t0);
      }
    }

    const result: SystemResult = {
      system: system.name,
      backend: system.store.backend,
      mode: system.opts.mode ?? 'auto',
      efSearch: system.opts.efSearch ?? null,
      recallAtK: hits / (vectors.length * k),
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      meanMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    };
    results.push(result);
    logger.log(
      `${result.system.padEnd(20)} recall@${k}=${result.recallAtK.toFixed(4)} p50=${result.p50Ms.toFixed(2)}ms p95=${result.p95Ms.toFixed(2)}ms`,
    );
  }

  const [{ count: chunks }] = await prisma.$queryRaw<[{ count: number }]>`
    SELECT count(*)::int AS count FROM "JobChunk" WHERE embedding IS NOT NULL
  `;
  const collection = await qdrant.info();
  const dir = createRunDir('ann-quick');
  writeJson(dir, 'config.json', {
    command: 'ann:quick',
    gitSha: gitSha(),
    createdAt: new Date().toISOString(),
    embeddingModel: embedding.modelName,
    corpusChunks: chunks,
    qdrant: {
      collection: qdrant.collection,
      points: collection.points_count,
      indexedVectors: collection.indexed_vectors_count,
      hnswConfig: collection.config.hnsw_config,
    },
    ...options,
  });
  writeJson(dir, 'results.json', results);
  logger.log(`Results written to ${dir}`);
}
