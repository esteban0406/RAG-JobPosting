import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../storage/prisma.service.js';
import {
  QdrantVectorStore,
  uuidV5,
  type QdrantPoint,
} from '../../storage/vector-store/qdrant.store.js';

interface ChunkRow {
  id: string;
  jobId: string;
  chunkType: string;
  chunkText: string;
  embeddingModel: string;
  embedding: string;
  source: string;
  jobType: string | null;
  isRemote: boolean;
  minSalary: number | null;
  maxSalary: number | null;
}

export interface BackfillOptions {
  recreate: boolean;
  batchSize: number;
}

const INDEXING_TIMEOUT_MS = 300_000;

// Copies every JobChunk vector from Postgres into Qdrant (idempotent: point
// ids derive from chunk ids), then waits until Qdrant has indexed them all.
export async function qdrantBackfill(
  app: INestApplicationContext,
  options: BackfillOptions,
): Promise<boolean> {
  const logger = new Logger('qdrant:backfill');
  const prisma = app.get(PrismaService);
  const qdrant = app.get(QdrantVectorStore);

  if (options.recreate) {
    logger.log(`Recreating collection ${qdrant.collection}`);
    await qdrant.recreateCollection();
  }

  let cursor: string | null = null;
  let copied = 0;
  for (;;) {
    const rows: ChunkRow[] = await prisma.$queryRaw<ChunkRow[]>`
      SELECT jc.id, jc."jobId", jc."chunkType", jc."chunkText",
             jc."embeddingModel", jc.embedding::text AS embedding,
             j.source, j."jobType", j."isRemote", j."minSalary", j."maxSalary"
      FROM "JobChunk" jc
      JOIN "Job" j ON j.id = jc."jobId"
      WHERE jc.embedding IS NOT NULL
      ${cursor ? Prisma.sql`AND jc.id > ${cursor}` : Prisma.empty}
      ORDER BY jc.id
      LIMIT ${options.batchSize}
    `;
    if (rows.length === 0) break;

    const points: QdrantPoint[] = rows.map((row) => ({
      id: uuidV5(row.id),
      vector: JSON.parse(row.embedding) as number[],
      payload: {
        chunkId: row.id,
        jobId: row.jobId,
        chunkType: row.chunkType,
        chunkText: row.chunkText,
        embeddingModel: row.embeddingModel,
        source: row.source,
        jobType: row.jobType,
        isRemote: row.isRemote,
        minSalary: row.minSalary,
        maxSalary: row.maxSalary,
      },
    }));
    await qdrant.upsertPoints(points);
    copied += rows.length;
    cursor = rows[rows.length - 1].id;
    logger.log(`Upserted ${copied} points`);
  }

  const [{ count: pgCount }] = await prisma.$queryRaw<[{ count: number }]>`
    SELECT count(*)::int AS count FROM "JobChunk" WHERE embedding IS NOT NULL
  `;

  const started = Date.now();
  let info = await qdrant.info();
  while (
    (info.status !== 'green' ||
      (info.indexed_vectors_count ?? 0) < (info.points_count ?? 0)) &&
    Date.now() - started < INDEXING_TIMEOUT_MS
  ) {
    await new Promise((r) => setTimeout(r, 1000));
    info = await qdrant.info();
  }

  const points = info.points_count ?? 0;
  const indexed = info.indexed_vectors_count ?? 0;
  logger.log(
    `Postgres chunks=${pgCount} | Qdrant points=${points} indexed=${indexed} status=${info.status}`,
  );
  const ok = points === pgCount && indexed === points;
  if (!ok) logger.error('Counts do not match; run again with --recreate');
  return ok;
}
