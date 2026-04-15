import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ChunkService } from './chunk.service.js';
import { IngestionController } from './ingestion.controller.js';
import { IngestionScheduler } from './ingestion.scheduler.js';
import { IngestionService } from './ingestion.service.js';
import { FindworkProvider } from './providers/findwork.provider.js';
import { JobicyProvider } from './providers/jobicy.provider.js';
import { RemotiveProvider } from './providers/remotive.provider.js';

@Module({
  imports: [StorageModule, EmbeddingModule, AuthModule, LlmModule],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    IngestionScheduler,
    ChunkService,
    FindworkProvider,
    RemotiveProvider,
    JobicyProvider,
  ],
})
export class IngestionModule {}
