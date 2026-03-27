import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { RagService } from './rag.service.js';

@Module({
  imports: [EmbeddingModule, StorageModule, LlmModule],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
