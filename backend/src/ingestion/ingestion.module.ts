import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { IngestionController } from './ingestion.controller.js';
import { IngestionScheduler } from './ingestion.scheduler.js';
import { IngestionService } from './ingestion.service.js';
import { ArbeitnowProvider } from './providers/arbeitnow.provider.js';

@Module({
  imports: [StorageModule, EmbeddingModule, AuthModule],
  controllers: [IngestionController],
  providers: [IngestionService, IngestionScheduler, ArbeitnowProvider],
})
export class IngestionModule {}
