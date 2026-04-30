import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PDFParse } from 'pdf-parse';
import type { Resume } from '../../generated/prisma/client.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import type { ParsedResume } from './interfaces/parsed-resume.interface.js';
import { ResumeParserService } from './resume-parser.service.js';
import { ResumeRepository } from './resume.repository.js';

@Injectable()
export class ResumeService {
  private readonly logger = new Logger(ResumeService.name);
  private readonly uploadDir: string;

  constructor(
    private readonly resumeRepo: ResumeRepository,
    private readonly resumeParser: ResumeParserService,
    private readonly embeddingService: EmbeddingService,
    config: ConfigService,
  ) {
    this.uploadDir = config.get<string>('RESUME_UPLOAD_DIR', 'uploads/resumes');
  }

  async upload(
    userId: string,
    file: Express.Multer.File,
  ): Promise<ParsedResume> {
    await fs.mkdir(this.uploadDir, { recursive: true });

    const filePath = join(this.uploadDir, `${userId}.pdf`);
    await fs.writeFile(filePath, file.buffer);

    const parser = new PDFParse({ data: file.buffer });
    const result = await parser.getText();
    const rawText = result.text;

    this.logger.debug(
      `Extracted ${rawText.length} chars from resume for user ${userId}`,
    );

    const [parsedData, embedding] = await Promise.all([
      this.resumeParser.parse(rawText),
      this.embeddingService.embed(rawText),
    ]);

    await this.resumeRepo.upsert(userId, {
      filePath,
      rawText,
      parsedData,
      embeddingModel: this.embeddingService.modelName,
      embedding,
    });

    this.logger.log(`Resume uploaded and processed for user ${userId}`);
    return parsedData;
  }

  async getResume(userId: string): Promise<Resume> {
    const resume = await this.resumeRepo.findByUserId(userId);
    if (!resume) throw new NotFoundException('Resume not found');
    return resume;
  }

  async getParsedData(userId: string): Promise<ParsedResume | null> {
    const resume = await this.resumeRepo.findByUserId(userId);
    if (!resume) return null;
    return resume.parsedData as unknown as ParsedResume;
  }

  async deleteResume(userId: string): Promise<void> {
    const resume = await this.resumeRepo.findByUserId(userId);
    if (!resume) throw new NotFoundException('Resume not found');

    await this.resumeRepo.delete(userId);

    try {
      await fs.unlink(resume.filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Could not delete resume file: ${resume.filePath}`);
      }
    }
  }
}
