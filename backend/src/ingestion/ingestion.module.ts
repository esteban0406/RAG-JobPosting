import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ChunkService } from './chunk.service.js';
import { IngestionController } from './ingestion.controller.js';
import { IngestionScheduler } from './ingestion.scheduler.js';
import { IngestionService } from './ingestion.service.js';
import { AdzunaProvider } from './providers/adzuna.provider.js';
import { RemotiveProvider } from './providers/remotive.provider.js';
import { WebNinjaProvider } from './providers/webninja.provider.js';
import { JobicyProvider } from './providers/jobicy.provider.js';
import { CareerjetProvider } from './providers/careerjet.provider.js';

@Module({
  imports: [StorageModule, EmbeddingModule, AuthModule],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    IngestionScheduler,
    ChunkService,
    AdzunaProvider,
    RemotiveProvider,
    WebNinjaProvider,
    JobicyProvider,
    CareerjetProvider,
  ],
})
export class IngestionModule {}
