import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

export interface JobChunkResult {
  id: string;
  jobId: string;
  chunkText: string;
  embeddingModel: string;
  similarity: number;
}

const EMBEDDING_VERSION = 1;

@Injectable()
export class VectorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertChunk(
    jobId: string,
    chunkText: string,
    embedding: number[],
    model: string,
  ): Promise<void> {
    const vectorLiteral = `[${embedding.join(',')}]`;

    await this.prisma.$transaction(async (tx) => {
      await tx.jobChunk.deleteMany({ where: { jobId } });

      const chunk = await tx.jobChunk.create({
        data: {
          jobId,
          chunkText,
          embeddingModel: model,
          embeddingVersion: EMBEDDING_VERSION,
        },
      });

      await tx.$executeRaw`
        UPDATE "JobChunk"
        SET embedding = ${vectorLiteral}::vector
        WHERE id = ${chunk.id}
      `;
    });
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

    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; jobId: string; chunkText: string; embeddingModel: string; similarity: number }>
    >`
      SELECT
        id,
        "jobId",
        "chunkText",
        "embeddingModel",
        1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM "JobChunk"
      WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT ${topK}
    `;

    return rows;
  }
}
