import { Injectable } from '@nestjs/common';
import { Prisma, type Resume } from '../../generated/prisma/client.js';
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
        parsedData: data.parsedData as unknown as Prisma.InputJsonValue,
        embeddingModel: data.embeddingModel,
      },
      update: {
        filePath: data.filePath,
        rawText: data.rawText,
        parsedData: data.parsedData as unknown as Prisma.InputJsonValue,
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

  async delete(userId: string): Promise<void> {
    await this.prisma.resume.delete({ where: { userId } });
  }
}
