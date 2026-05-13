import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { Resume } from '../../generated/prisma/client.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { R2StorageService } from '../storage/r2-storage.service.js';
import type { ParsedResume } from './interfaces/parsed-resume.interface.js';
import { ResumeParserService } from './resume-parser.service.js';
import { ResumeRepository } from './resume.repository.js';

const DOCX_MIMETYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Injectable()
export class ResumeService {
  private readonly logger = new Logger(ResumeService.name);

  constructor(
    private readonly resumeRepo: ResumeRepository,
    private readonly resumeParser: ResumeParserService,
    private readonly embeddingService: EmbeddingService,
    private readonly r2: R2StorageService,
  ) {}

  async upload(
    userId: string,
    file: Express.Multer.File,
  ): Promise<ParsedResume> {
    const ext = file.mimetype === DOCX_MIMETYPE ? 'docx' : 'pdf';
    const key = `resumes/${userId}.${ext}`;

    const [rawText] = await Promise.all([
      this.extractText(file.buffer, file.mimetype),
      this.r2.uploadFile(key, file.buffer, file.mimetype),
    ]);

    this.logger.debug(
      `Extracted ${rawText.length} chars from resume for user ${userId}`,
    );

    const [parsedData, embedding] = await Promise.all([
      this.resumeParser.parse(rawText),
      this.embeddingService.embed(rawText),
    ]);

    await this.resumeRepo.upsert(userId, {
      filePath: key,
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

  async getDownloadUrl(userId: string): Promise<string> {
    const resume = await this.resumeRepo.findByUserId(userId);
    if (!resume) throw new NotFoundException('Resume not found');
    return this.r2.getPresignedUrl(resume.filePath);
  }

  async deleteResume(userId: string): Promise<void> {
    const resume = await this.resumeRepo.findByUserId(userId);
    if (!resume) throw new NotFoundException('Resume not found');
    await this.resumeRepo.delete(userId);
  }

  private async extractText(buffer: Buffer, mimetype: string): Promise<string> {
    if (mimetype === DOCX_MIMETYPE) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  }
}
