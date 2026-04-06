import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { CalibrationService } from './calibration.service.js';
import { EvalController } from './eval.controller.js';
import { EvalService } from './eval.service.js';
import { GeminiJudgeService } from './judge/gemini-judge.service.js';
import { JudgmentCacheService } from './judge/judgment-cache.service.js';
import { OllamaJudgeService } from './judge/ollama-judge.service.js';
import { LabelingService } from './labeling.service.js';
import { ReportService } from './report.service.js';

@Module({
  imports: [StorageModule, EmbeddingModule, LlmModule],
  controllers: [EvalController],
  providers: [
    EvalService,
    LabelingService,
    OllamaJudgeService,
    GeminiJudgeService,
    JudgmentCacheService,
    CalibrationService,
    ReportService,
  ],
})
export class EvalModule {}
