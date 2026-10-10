import { Module } from '@nestjs/common';
import { JobRepository } from './job.repository.js';
import { PrismaService } from './prisma.service.js';
import { R2StorageService } from './r2-storage.service.js';
import { PgVectorStore } from './vector-store/pgvector.store.js';
import { QdrantVectorStore } from './vector-store/qdrant.store.js';
import { VECTOR_STORE } from './vector-store/vector-store.interface.js';
import { vectorStoreProvider } from './vector-store/vector-store.provider.js';

@Module({
  providers: [
    PrismaService,
    JobRepository,
    PgVectorStore,
    QdrantVectorStore,
    vectorStoreProvider,
    R2StorageService,
  ],
  exports: [
    PrismaService,
    JobRepository,
    PgVectorStore,
    QdrantVectorStore,
    VECTOR_STORE,
    R2StorageService,
  ],
})
export class StorageModule {}
