import { ConfigService } from '@nestjs/config';
import { vectorStoreProvider } from '../../../src/storage/vector-store/vector-store.provider.js';
import type { PgVectorStore } from '../../../src/storage/vector-store/pgvector.store.js';
import type { QdrantVectorStore } from '../../../src/storage/vector-store/qdrant.store.js';

const factory = (
  vectorStoreProvider as { useFactory: (...args: unknown[]) => unknown }
).useFactory;
const pg = { backend: 'pgvector' } as PgVectorStore;
const qdrant = { backend: 'qdrant' } as QdrantVectorStore;
const config = (backend?: string) =>
  ({
    get: (_key: string, fallback: unknown) => backend ?? fallback,
  }) as unknown as ConfigService;

describe('vectorStoreProvider', () => {
  it('serves pgvector by default', () => {
    expect(factory(config(), pg, qdrant)).toBe(pg);
  });

  it('serves Qdrant when VECTOR_BACKEND=qdrant', () => {
    expect(factory(config('qdrant'), pg, qdrant)).toBe(qdrant);
  });
});
