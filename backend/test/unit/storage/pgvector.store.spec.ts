import { PgVectorStore } from '../../../src/storage/vector-store/pgvector.store.js';
import type { PrismaService } from '../../../src/storage/prisma.service.js';

interface SqlLike {
  sql: string;
  values: unknown[];
}

function buildStore(rows: Array<Record<string, unknown>> = []) {
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue(rows),
  };
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue(rows),
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const store = new PgVectorStore(prisma as unknown as PrismaService);
  return { store, prisma, tx };
}

const row = (id: string, similarity: number) => ({
  id,
  jobId: `job-${id}`,
  chunkType: 'identity',
  chunkText: 'text',
  embeddingModel: 'e5',
  similarity,
});

describe('PgVectorStore', () => {
  it('orders by the distance operator so the HNSW index can be used', async () => {
    const { store, prisma } = buildStore();

    await store.search([0.1, 0.2], { topK: 15 });

    const query = prisma.$queryRaw.mock.calls[0][0] as SqlLike;
    expect(query.sql).toMatch(/ORDER BY jc\.embedding <=> \?::vector/);
    expect(query.sql).toMatch(/LIMIT \?/);
    expect(query.sql).not.toMatch(/ORDER BY similarity/);
    expect(query.values).toContain(15);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('applies the similarity threshold after the index scan', async () => {
    const { store } = buildStore([row('a', 0.8), row('b', 0.4)]);

    const result = await store.findSimilar([0.1], 15, 0.5);

    expect(result.map((r) => r.id)).toEqual(['a']);
  });

  it('disables index scans for exact search', async () => {
    const { store, tx } = buildStore();

    await store.search([0.1], { topK: 10, mode: 'exact' });

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'SET LOCAL enable_indexscan = off',
    );
  });

  it('forces the index and sets ef_search in ann mode', async () => {
    const { store, tx } = buildStore();

    await store.search([0.1], { topK: 10, mode: 'ann', efSearch: 128 });

    expect(tx.$executeRawUnsafe.mock.calls.map((c) => c[0])).toEqual([
      'SET LOCAL enable_seqscan = off',
      'SET LOCAL hnsw.ef_search = 128',
    ]);
  });

  it('joins jobs and enables iterative scans for filtered search', async () => {
    const { store, tx } = buildStore();

    await store.search([0.1], {
      topK: 10,
      filter: { minSalary: 100000, jobType: 'contract' },
    });

    const query = tx.$queryRaw.mock.calls[0][0] as SqlLike;
    expect(query.sql).toContain('JOIN "Job" j');
    expect(query.sql).toContain('j."minSalary" >=');
    expect(query.sql).toContain('j."jobType" =');
    expect(query.values).toEqual(expect.arrayContaining([100000, 'contract']));
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'SET LOCAL hnsw.iterative_scan = relaxed_order',
    );
  });

  it('filters by the most a job can pay for salaryAtLeast', async () => {
    const { store, tx } = buildStore();

    await store.search([0.1], { topK: 10, filter: { salaryAtLeast: 150000 } });

    const query = (tx.$queryRaw.mock.calls as unknown[][])[0][0] as SqlLike;
    expect(query.sql).toContain('COALESCE(j."maxSalary", j."minSalary") >=');
    expect(query.values).toEqual(expect.arrayContaining([150000]));
  });

  it('matches any of several job types', async () => {
    const { store, tx } = buildStore();

    await store.search([0.1], {
      topK: 10,
      filter: { jobType: ['contract', 'freelance'] },
    });

    const query = (tx.$queryRaw.mock.calls as unknown[][])[0][0] as SqlLike;
    expect(query.sql).toContain('j."jobType" = ANY(');
    expect(query.values).toEqual(
      expect.arrayContaining([['contract', 'freelance']]),
    );
  });

  it('rejects an invalid ef_search', async () => {
    const { store } = buildStore();

    await expect(
      store.search([0.1], { topK: 10, efSearch: 1.5 }),
    ).rejects.toThrow('Invalid efSearch');
  });
});
