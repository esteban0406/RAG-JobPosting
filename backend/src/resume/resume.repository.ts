import { Injectable } from '@nestjs/common';
import type { Resume } from '../../generated/prisma/client.js';
import { PrismaService } from '../storage/prisma.service.js';
import type { ParsedResume } from './interfaces/parsed-resume.interface.js';

interface UpsertResumeData {
  filePath: string;
  rawText: string;
  parsedData: ParsedResume;
  embeddingModel: string;
  embedding: number[];
}

@Injectable()
export class ResumeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(userId: string, data: UpsertResumeData): Promise<Resume> {
    const record = await this.prisma.resume.upsert({
      where: { userId },
      create: {
        userId,
        filePath: data.filePath,
        rawText: data.rawText,
        parsedData: data.parsedData as object,
        embeddingModel: data.embeddingModel,
      },
      update: {
        filePath: data.filePath,
        rawText: data.rawText,
        parsedData: data.parsedData as object,
        embeddingModel: data.embeddingModel,
      },
    });

    const vectorLiteral = `[${data.embedding.join(',')}]`;
    await this.prisma.$executeRaw`
      UPDATE "Resume"
      SET embedding = ${vectorLiteral}::vector
      WHERE id = ${record.id}
    `;

    return record;
  }

  async findByUserId(userId: string): Promise<Resume | null> {
    return this.prisma.resume.findUnique({ where: { userId } });
  }

  async getEmbedding(userId: string): Promise<number[] | null> {
    const rows = await this.prisma.$queryRaw<Array<{ embedding: string | null }>>`
      SELECT embedding::text
      FROM "Resume"
      WHERE "userId" = ${userId}
    `;

    if (!rows.length || !rows[0].embedding) return null;

    // Parse postgres vector literal "[0.1,0.2,...]"
    const raw = rows[0].embedding.replace(/^\[|\]$/g, '');
    return raw.split(',').map(Number);
  }

  async delete(userId: string): Promise<void> {
    await this.prisma.resume.delete({ where: { userId } });
  }
}
