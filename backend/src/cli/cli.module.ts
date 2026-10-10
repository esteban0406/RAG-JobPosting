import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { validate } from '../config/config.schema.js';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { RagModule } from '../rag/rag.module.js';
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
  ],
})
export class CliModule {}
