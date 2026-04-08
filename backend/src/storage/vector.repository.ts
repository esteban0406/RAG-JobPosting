import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

export interface JobChunkResult {
  id: string;
  jobId: string;
  chunkType: string;
  chunkText: string;
  embeddingModel: string;
  similarity: number;
}

export interface JobChunkWithJob extends JobChunkResult {
  jobTitle: string;
  jobDescription: string;
}

const EMBEDDING_VERSION = 1;

@Injectable()
export class VectorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertChunks(
    jobId: string,
    chunks: Array<{
      type: string;
      text: string;
      embedding: number[];
      model: string;
    }>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.jobChunk.deleteMany({ where: { jobId } });

      for (const chunk of chunks) {
        const vectorLiteral = `[${chunk.embedding.join(',')}]`;
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
          SET embedding = ${vectorLiteral}::vector
          WHERE id = ${record.id}
        `;
      }
    });
  }

  async findSimilarWithJob(
    queryVector: number[],
    topK: number,
    threshold: number,
  ): Promise<JobChunkWithJob[]> {
    const vectorLiteral = `[${queryVector.join(',')}]`;

    return this.prisma.$queryRaw<JobChunkWithJob[]>`
      SELECT
        jc.id,
        jc."jobId",
        jc."chunkType",
        jc."chunkText",
        jc."embeddingModel",
        1 - (jc.embedding <=> ${vectorLiteral}::vector) AS similarity,
        j.title AS "jobTitle",
        j.description AS "jobDescription"
      FROM "JobChunk" jc
      JOIN "Job" j ON j.id = jc."jobId"
      WHERE jc.embedding IS NOT NULL
        AND 1 - (jc.embedding <=> ${vectorLiteral}::vector) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT ${topK}
    `;
  }

  async hasEmbedding(jobId: string): Promise<boolean> {
    const count = await this.prisma.jobChunk.count({ where: { jobId } });
    return count > 0;
  }

  async findSimilar(
    queryVector: number[],
    topK: number,
    threshold: number,
  ): Promise<JobChunkResult[]> {
    const vectorLiteral = `[${queryVector.join(',')}]`;

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
        AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT ${topK}
    `;
  }
}
