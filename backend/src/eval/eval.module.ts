import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { EvalController } from './eval.controller.js';
import { EvalService } from './eval.service.js';
import { LabelingService } from './labeling.service.js';

@Module({
  imports: [StorageModule, EmbeddingModule],
  controllers: [EvalController],
  providers: [EvalService, LabelingService],
})
export class EvalModule {}
