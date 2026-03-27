import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { validate } from './config/config.schema.js';
import { EmbeddingModule } from './embedding/embedding.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { LlmModule } from './llm/llm.module.js';
import { QueryModule } from './query/query.module.js';
import { RagModule } from './rag/rag.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ validate, isGlobal: true }),
    CacheModule.register({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    StorageModule,
    EmbeddingModule,
    IngestionModule,
    LlmModule,
    RagModule,
    QueryModule,
  ],
})
export class AppModule {}
