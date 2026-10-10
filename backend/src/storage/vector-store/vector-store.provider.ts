import { type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgVectorStore } from './pgvector.store.js';
import { QdrantVectorStore } from './qdrant.store.js';
import {
  VECTOR_STORE,
  type VectorBackend,
  type VectorStore,
} from './vector-store.interface.js';

// Selects the backend that serves the application; both stores stay
// injectable by class for backfill and benchmarking.
export const vectorStoreProvider: Provider = {
  provide: VECTOR_STORE,
  inject: [ConfigService, PgVectorStore, QdrantVectorStore],
  useFactory: (
    config: ConfigService,
    pg: PgVectorStore,
    qdrant: QdrantVectorStore,
  ): VectorStore =>
    config.get<VectorBackend>('VECTOR_BACKEND', 'pgvector') === 'qdrant'
      ? qdrant
      : pg,
};
