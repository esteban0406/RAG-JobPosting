import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { IngestionController } from './ingestion.controller.js';
import { IngestionScheduler } from './ingestion.scheduler.js';
import { IngestionService } from './ingestion.service.js';
import { ArbeitnowProvider } from './providers/arbeitnow.provider.js';

@Module({
  imports: [StorageModule, EmbeddingModule],
  controllers: [IngestionController],
  providers: [IngestionService, IngestionScheduler, ArbeitnowProvider],
})
export class IngestionModule {}
