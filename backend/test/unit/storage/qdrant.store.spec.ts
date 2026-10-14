import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { PgVectorStore } from '../../../src/storage/vector-store/pgvector.store.js';
import {
  QdrantVectorStore,
  uuidV5,
} from '../../../src/storage/vector-store/qdrant.store.js';
import {
  DEFAULT_EF_SEARCH,
  HNSW_EF_CONSTRUCTION,
  HNSW_M,
} from '../../../src/storage/vector-store/vector-store.interface.js';

jest.mock('@qdrant/js-client-rest');

const JOB = {
  id: 'job-1',
  source: 'jobicy',
  jobType: 'full_time',
  isRemote: true,
  minSalary: 100000,
  maxSalary: 150000,
};

function buildStore(collectionExists = true) {
  const client = {
    collectionExists: jest.fn().mockResolvedValue({ exists: collectionExists }),
    createCollection: jest.fn().mockResolvedValue(true),
    createPayloadIndex: jest.fn().mockResolvedValue({}),
    deleteCollection: jest.fn().mockResolvedValue(true),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue({ count: 0 }),
    query: jest.fn().mockResolvedValue({ points: [] }),
  };
  (QdrantClient as unknown as jest.Mock).mockImplementation(() => client);
  const pg = { writeRows: jest.fn() } as unknown as jest.Mocked<PgVectorStore>;
  const config = {
    get: jest.fn((key: string, fallback?: unknown) =>
      key === 'QDRANT_COLLECTION' ? 'test_chunks' : fallback,
    ),
  } as unknown as ConfigService;
  return { store: new QdrantVectorStore(pg, config), client, pg };
}

describe('uuidV5', () => {
  it('matches the RFC 4122 reference value', () => {
    expect(
      uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
    ).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('is deterministic per chunk id', () => {
    expect(uuidV5('chunk-a')).toBe(uuidV5('chunk-a'));
    expect(uuidV5('chunk-a')).not.toBe(uuidV5('chunk-b'));
  });
});

describe('QdrantVectorStore', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates the collection once, with the shared HNSW parameters', async () => {
    const { store, client } = buildStore(false);

    await store.search([0.1], { topK: 5 });
    await store.search([0.1], { topK: 5 });

    expect(client.createCollection).toHaveBeenCalledTimes(1);
    expect(client.createCollection).toHaveBeenCalledWith(
      'test_chunks',
      expect.objectContaining({
        vectors: { size: 768, distance: 'Cosine' },
        hnsw_config: { m: HNSW_M, ef_construct: HNSW_EF_CONSTRUCTION },
      }),
    );
    expect(client.createPayloadIndex).toHaveBeenCalledWith(
      'test_chunks',
      expect.objectContaining({ field_name: 'jobId', field_schema: 'keyword' }),
    );
  });

  it('writes Postgres rows first, then replaces the job points', async () => {
    const { store, client, pg } = buildStore();
    pg.writeRows.mockResolvedValueOnce(['c1', 'c2']);

    await store.upsertChunks(JOB, [
      {
        type: 'identity',
        text: 'Engineer at Acme',
        embedding: [0.1],
        model: 'e5',
      },
      { type: 'benefits', text: 'Health', embedding: [0.2], model: 'e5' },
    ]);

    expect(pg.writeRows).toHaveBeenCalledWith('job-1', expect.any(Array));
    expect(client.delete).toHaveBeenCalledWith('test_chunks', {
      wait: true,
      filter: { must: [{ key: 'jobId', match: { any: ['job-1'] } }] },
    });
    const { points } = client.upsert.mock.calls[0][1];
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({
      id: uuidV5('c1'),
      vector: [0.1],
      payload: expect.objectContaining({
        chunkId: 'c1',
        jobId: 'job-1',
        chunkType: 'identity',
        isRemote: true,
        minSalary: 100000,
      }),
    });
  });

  it('maps search options to Qdrant query parameters and results', async () => {
    const { store, client } = buildStore();
    client.query.mockResolvedValueOnce({
      points: [
        {
          id: 'p1',
          score: 0.91,
          payload: {
            chunkId: 'c1',
            jobId: 'job-1',
            chunkType: 'identity',
            chunkText: 'text',
            embeddingModel: 'e5',
          },
        },
      ],
    });

    const rows = await store.search([0.1, 0.2], {
      topK: 10,
      threshold: 0.5,
      efSearch: 64,
      filter: { minSalary: 90000, isRemote: true },
    });

    expect(client.query).toHaveBeenCalledWith('test_chunks', {
      query: [0.1, 0.2],
      limit: 10,
      score_threshold: 0.5,
      filter: {
        must: [
          { key: 'minSalary', range: { gte: 90000 } },
          { key: 'isRemote', match: { value: true } },
        ],
      },
      params: { exact: false, hnsw_ef: 64 },
      with_payload: true,
    });
    expect(rows).toEqual([
      {
        id: 'c1',
        jobId: 'job-1',
        chunkType: 'identity',
        chunkText: 'text',
        embeddingModel: 'e5',
        similarity: 0.91,
      },
    ]);
  });

  it('maps salaryAtLeast to max salary, or min salary when max is missing', async () => {
    const { store, client } = buildStore();
    client.query.mockResolvedValueOnce({ points: [] });

    await store.search([0.1], { topK: 5, filter: { salaryAtLeast: 150000 } });

    const [, request] = client.query.mock.calls[0] as [
      string,
      { filter: unknown },
    ];
    expect(request.filter).toEqual({
      must: [
        {
          should: [
            { key: 'maxSalary', range: { gte: 150000 } },
            {
              must: [
                { is_empty: { key: 'maxSalary' } },
                { key: 'minSalary', range: { gte: 150000 } },
              ],
            },
          ],
        },
      ],
    });
  });

  it('uses exact search and the default ef when requested', async () => {
    const { store, client } = buildStore();

    await store.search([0.1], { topK: 3, mode: 'exact' });
    await store.findSimilar([0.1], 3, 0.5);

    expect(client.query.mock.calls[0][1].params).toEqual({
      exact: true,
      hnsw_ef: DEFAULT_EF_SEARCH,
    });
    expect(client.query.mock.calls[1][1].params).toEqual({
      exact: false,
      hnsw_ef: DEFAULT_EF_SEARCH,
    });
  });

  it('restricts findSimilarByJobIds to the given jobs', async () => {
    const { store, client } = buildStore();

    await store.findSimilarByJobIds([0.1], ['job-1', 'job-2']);

    expect(client.query).toHaveBeenCalledWith(
      'test_chunks',
      expect.objectContaining({
        limit: 12,
        filter: {
          must: [{ key: 'jobId', match: { any: ['job-1', 'job-2'] } }],
        },
      }),
    );
  });

  it('reports embeddings from the Qdrant point count', async () => {
    const { store, client } = buildStore();
    client.count.mockResolvedValueOnce({ count: 4 });

    await expect(store.hasEmbedding('job-1')).resolves.toBe(true);
  });
});
