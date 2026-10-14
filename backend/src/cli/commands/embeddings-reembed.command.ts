import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { EmbeddingService } from '../../embedding/embedding.service.js';
import { PrismaService } from '../../storage/prisma.service.js';

export interface ReembedOptions {
  batchSize: number;
}

interface ChunkRow {
  id: string;
  chunkText: string;
}

// Re-embeds every JobChunk in place with the configured embedding model.
// Chunk ids and texts are kept, so the corpus stays the same and only the
// vector space changes. Then rebuilds the HNSW index; Qdrant is refreshed
// separately with `qdrant:backfill --recreate`.
export async function embeddingsReembed(
  app: INestApplicationContext,
  options: ReembedOptions,
): Promise<boolean> {
  const logger = new Logger('embeddings:reembed');
  const prisma = app.get(PrismaService);
  const embedding = app.get(EmbeddingService);
  const model = embedding.modelName;

  const [{ total }] = await prisma.$queryRaw<[{ total: number }]>`
    SELECT count(*)::int AS total FROM "JobChunk"
  `;
  logger.log(`Re-embedding ${total} chunks with ${model}`);

  let cursor: string | null = null;
  let done = 0;
  for (;;) {
    const rows: ChunkRow[] = await prisma.$queryRaw<ChunkRow[]>`
      SELECT id, "chunkText" FROM "JobChunk"
      ${cursor ? Prisma.sql`WHERE id > ${cursor}` : Prisma.empty}
      ORDER BY id
      LIMIT ${options.batchSize}
    `;
    if (rows.length === 0) break;

    const vectors = await embedding.embedBatch(rows.map((r) => r.chunkText));
    await prisma.$transaction(
      rows.map(
        (row, i) => prisma.$executeRaw`
          UPDATE "JobChunk"
          SET embedding = ${`[${vectors[i].join(',')}]`}::vector,
              "embeddingModel" = ${model}
          WHERE id = ${row.id}
        `,
      ),
    );
    done += rows.length;
    cursor = rows[rows.length - 1].id;
    logger.log(`${done}/${total}`);
  }

  // Every row was rewritten; a fresh build avoids a graph full of dead tuples.
  logger.log('Rebuilding the HNSW index');
  await prisma.$executeRawUnsafe('REINDEX INDEX "JobChunk_embedding_hnsw_idx"');

  const [{ stale }] = await prisma.$queryRaw<[{ stale: number }]>`
    SELECT count(*)::int AS stale FROM "JobChunk"
    WHERE embedding IS NULL OR "embeddingModel" <> ${model}
  `;
  if (stale > 0) {
    logger.error(`${stale} chunks still lack a ${model} embedding`);
    return false;
  }
  logger.log(
    `${done} chunks now use ${model}. Next: qdrant:backfill --recreate`,
  );
  return true;
}
