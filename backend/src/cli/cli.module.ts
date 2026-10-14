import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { validate } from '../config/config.schema.js';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { AggregationRepository } from '../query/aggregation/aggregation.repository.js';
import { AggregationService } from '../query/aggregation/aggregation.service.js';
import { QueryClassifierService } from '../query/query-classifier.service.js';
import { RagModule } from '../rag/rag.module.js';
import { RetrievalModule } from '../retrieval/retrieval.module.js';
import { StorageModule } from '../storage/storage.module.js';

// Offline tooling context: no HTTP server, scheduler or request logging.
@Module({
  imports: [
    ConfigModule.forRoot({ validate, isGlobal: true }),
    CacheModule.register({ isGlobal: true }),
    // Required by guards in modules the RAG pipeline depends on.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    StorageModule,
    EmbeddingModule,
    RagModule,
    RetrievalModule,
    LlmModule,
  ],
  // The aggregation path without QueryModule, whose controller needs auth.
  providers: [
    QueryClassifierService,
    AggregationRepository,
    AggregationService,
  ],
})
export class CliModule {}
