import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ResumeController } from './resume.controller.js';
import { ResumeParserService } from './resume-parser.service.js';
import { ResumeRepository } from './resume.repository.js';
import { ResumeService } from './resume.service.js';

@Module({
  imports: [StorageModule, EmbeddingModule, AuthModule],
  controllers: [ResumeController],
  providers: [ResumeService, ResumeParserService, ResumeRepository],
  exports: [ResumeService],
})
export class ResumeModule {}
