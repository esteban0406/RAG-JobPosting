import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';
import {
  DEFAULT_EF_SEARCH,
  type EmbeddedChunk,
  type JobChunkResult,
  type SearchOptions,
  type VectorFilter,
  type VectorJobMeta,
  type VectorStore,
} from './vector-store.interface.js';

export interface JobChunkWithJob extends JobChunkResult {
  jobTitle: string;
  jobDescription: string;
}

const EMBEDDING_VERSION = 1;

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

@Injectable()
export class PgVectorStore implements VectorStore {
  readonly backend = 'pgvector' as const;

  constructor(private readonly prisma: PrismaService) {}

  async upsertChunks(
    job: VectorJobMeta,
    chunks: EmbeddedChunk[],
  ): Promise<void> {
    await this.writeRows(job.id, chunks);
  }

  // Replaces a job's chunk rows (text + vector) and returns the new chunk ids
  // in input order. Postgres stays the source of truth for chunk text even
  // when Qdrant serves the vector search.
  async writeRows(jobId: string, chunks: EmbeddedChunk[]): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.jobChunk.deleteMany({ where: { jobId } });

      const ids: string[] = [];
      for (const chunk of chunks) {
        const record = await tx.jobChunk.create({
          data: {
            jobId,
            chunkType: chunk.type,
            chunkText: chunk.text,
            embeddingModel: chunk.model,
            embeddingVersion: EMBEDDING_VERSION,
          },
        });
        await tx.$executeRaw`
          UPDATE "JobChunk"
          SET embedding = ${toVectorLiteral(chunk.embedding)}::vector
          WHERE id = ${record.id}
        `;
        ids.push(record.id);
      }
      return ids;
    });
  }

  // ORDER BY the raw distance operator with a LIMIT is the only shape the
  // planner can serve from the HNSW index; ordering by a derived similarity
  // expression forces a sequential scan.
  async search(
    queryVector: number[],
    options: SearchOptions,
  ): Promise<JobChunkResult[]> {
    const vec = toVectorLiteral(queryVector);
    const filterSql = this.buildFilter(options.filter);
    const query = Prisma.sql`
      SELECT
        jc.id,
        jc."jobId",
        jc."chunkType",
        jc."chunkText",
        jc."embeddingModel",
        1 - (jc.embedding <=> ${vec}::vector) AS similarity
      FROM "JobChunk" jc
      ${filterSql ? Prisma.sql`JOIN "Job" j ON j.id = jc."jobId"` : Prisma.empty}
      WHERE jc.embedding IS NOT NULL
      ${filterSql ? Prisma.sql`AND ${filterSql}` : Prisma.empty}
      ORDER BY jc.embedding <=> ${vec}::vector
      LIMIT ${options.topK}
    `;

    const settings = this.sessionSettings(options, filterSql !== null);
    const rows =
      settings.length === 0
        ? await this.prisma.$queryRaw<JobChunkResult[]>(query)
        : await this.prisma.$transaction(async (tx) => {
            for (const setting of settings) await tx.$executeRawUnsafe(setting);
            return tx.$queryRaw<JobChunkResult[]>(query);
          });

    const threshold = options.threshold ?? -1;
    return rows
      .map((row) => ({ ...row, similarity: Number(row.similarity) }))
      .filter((row) => row.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);
  }

  async findSimilar(
    queryVector: number[],
    topK: number,
    threshold: number,
  ): Promise<JobChunkResult[]> {
    return this.search(queryVector, { topK, threshold });
  }

  async findSimilarByJobIds(
    queryVector: number[],
    jobIds: string[],
  ): Promise<JobChunkResult[]> {
    if (jobIds.length === 0) return [];
    const vectorLiteral = toVectorLiteral(queryVector);
    const idList = Prisma.join(jobIds.map((id) => Prisma.sql`${id}`));

    return this.prisma.$queryRaw<JobChunkResult[]>`
      SELECT
        id,
        "jobId",
        "chunkType",
        "chunkText",
        "embeddingModel",
        1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM "JobChunk"
      WHERE embedding IS NOT NULL
        AND "jobId" IN (${idList})
      ORDER BY similarity DESC
    `;
  }

  // Legacy HTTP evaluation endpoint only; the evaluation CLI joins jobs itself.
  async findSimilarWithJob(
    queryVector: number[],
    topK: number,
    threshold: number,
  ): Promise<JobChunkWithJob[]> {
    const chunks = await this.search(queryVector, { topK, threshold });
    if (chunks.length === 0) return [];
    const jobs = await this.prisma.job.findMany({
      where: { id: { in: [...new Set(chunks.map((c) => c.jobId))] } },
      select: { id: true, title: true, description: true },
    });
    const jobMap = new Map(jobs.map((j) => [j.id, j]));
    return chunks.map((c) => ({
      ...c,
      jobTitle: jobMap.get(c.jobId)?.title ?? '',
      jobDescription: jobMap.get(c.jobId)?.description ?? '',
    }));
  }

  async hasEmbedding(jobId: string): Promise<boolean> {
    const count = await this.prisma.jobChunk.count({ where: { jobId } });
    return count > 0;
  }

  // Chunk rows are removed by the Job foreign-key cascade.
  async deleteByJobIds(): Promise<void> {}

  async clear(): Promise<void> {}

  private sessionSettings(options: SearchOptions, filtered: boolean): string[] {
    if (options.mode === 'exact') return ['SET LOCAL enable_indexscan = off'];

    const settings: string[] = [];
    if (options.mode === 'ann') settings.push('SET LOCAL enable_seqscan = off');
    const ef = options.efSearch;
    if (ef !== undefined && ef !== DEFAULT_EF_SEARCH) {
      if (!Number.isInteger(ef) || ef < 1) {
        throw new Error(`Invalid efSearch: ${ef}`);
      }
      settings.push(`SET LOCAL hnsw.ef_search = ${ef}`);
    }
    // Without iterative scans a selective filter can leave fewer than topK
    // rows once HNSW's candidate list is exhausted (pgvector >= 0.8).
    if (filtered)
      settings.push('SET LOCAL hnsw.iterative_scan = relaxed_order');
    return settings;
  }

  private buildFilter(filter?: VectorFilter): Prisma.Sql | null {
    if (!filter) return null;
    const conditions: Prisma.Sql[] = [];
    if (filter.minSalary !== undefined) {
      conditions.push(Prisma.sql`j."minSalary" >= ${filter.minSalary}`);
    }
    if (filter.maxSalary !== undefined) {
      conditions.push(Prisma.sql`j."maxSalary" <= ${filter.maxSalary}`);
    }
    if (filter.jobType !== undefined) {
      conditions.push(Prisma.sql`j."jobType" = ${filter.jobType}`);
    }
    if (filter.isRemote !== undefined) {
      conditions.push(Prisma.sql`j."isRemote" = ${filter.isRemote}`);
    }
    return conditions.length > 0 ? Prisma.join(conditions, ' AND ') : null;
  }
}
