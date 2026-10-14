import type { ConfigService } from '@nestjs/config';
import type { EmbeddingService } from '../../../src/embedding/embedding.service.js';
import type { Bm25IndexService } from '../../../src/retrieval/bm25-index.service.js';
import type { RerankService } from '../../../src/retrieval/rerank.service.js';
import {
  RetrievalPipeline,
  rerankDocument,
} from '../../../src/retrieval/retrieval-pipeline.service.js';
import type { JobRepository } from '../../../src/storage/job.repository.js';
import type {
  JobChunkResult,
  VectorStore,
} from '../../../src/storage/vector-store/vector-store.interface.js';

const chunk = (
  jobId: string,
  similarity: number,
  type = 'identity',
): JobChunkResult => ({
  id: `${jobId}-${type}`,
  jobId,
  chunkType: type,
  chunkText: `${jobId} ${type} text`,
  embeddingModel: 'multilingual-e5-base',
  similarity,
});

const job = (id: string) => ({
  id,
  title: `Title ${id}`,
  company: `Co ${id}`,
  location: 'Remote',
  jobType: 'full_time',
  minSalary: null,
  maxSalary: null,
});

function build(
  options: {
    dense?: JobChunkResult[];
    lexical?: string[];
    rerankScores?: (docs: string[]) => number[];
    env?: Record<string, string>;
  } = {},
) {
  const embedding = { embedQuery: jest.fn().mockResolvedValue([0.1, 0.2]) };
  const store = {
    backend: 'qdrant',
    search: jest.fn().mockResolvedValue(options.dense ?? []),
    findSimilarByJobIds: jest.fn((_v: number[], ids: string[]) =>
      Promise.resolve(ids.map((id) => chunk(id, 0.8))),
    ),
  };
  const jobs = {
    findByIds: jest.fn((ids: string[]) => Promise.resolve(ids.map(job))),
  };
  const bm25 = {
    search: jest
      .fn()
      .mockResolvedValue(
        (options.lexical ?? []).map((id, i) => ({ id, score: 10 - i })),
      ),
  };
  const reranker = {
    score: jest.fn((_q: string, docs: string[]) =>
      Promise.resolve({
        scores: options.rerankScores
          ? options.rerankScores(docs)
          : docs.map(() => 0.5),
        model: 'BAAI/bge-reranker-v2-m3',
      }),
    ),
  };
  const env = {
    RETRIEVAL_HYBRID: 'true',
    RERANK_ENABLED: 'true',
    ...options.env,
  };
  const config = {
    get: (key: string, fallback?: unknown) =>
      key in env ? env[key as keyof typeof env] : fallback,
  } as unknown as ConfigService;
  const pipeline = new RetrievalPipeline(
    embedding as unknown as EmbeddingService,
    store as unknown as VectorStore,
    jobs as unknown as JobRepository,
    bm25 as unknown as Bm25IndexService,
    reranker as unknown as RerankService,
    config,
  );
  return { pipeline, embedding, store, jobs, bm25, reranker };
}

const ids = (result: { hits: Array<{ job: { id: string } }> }) =>
  result.hits.map((h) => h.job.id);

describe('RetrievalPipeline', () => {
  it('ranks dense results by each job’s best chunk', async () => {
    const { pipeline } = build({
      dense: [chunk('a', 0.7), chunk('b', 0.9), chunk('a', 0.6, 'skills')],
    });

    const result = await pipeline.retrieve('q', {
      depth: 5,
      hybrid: false,
      rerank: false,
    });

    expect(ids(result)).toEqual(['b', 'a']);
    expect(result.reranked).toBe(false);
  });

  it('fuses BM25 and dense lists, keeping lexical-only jobs', async () => {
    const { pipeline, bm25 } = build({
      dense: [chunk('a', 0.9), chunk('b', 0.8)],
      lexical: ['b', 'c'],
    });

    const result = await pipeline.retrieve('q', {
      depth: 5,
      hybrid: true,
      rerank: false,
    });

    expect(ids(result)).toEqual(['b', 'a', 'c']);
    expect(bm25.search).toHaveBeenCalledWith('q', 50, undefined);
  });

  it('applies the same filter to dense and lexical candidates', async () => {
    const { pipeline, store, bm25 } = build({ dense: [chunk('a', 0.9)] });
    const filter = { salaryAtLeast: 150000 };

    await pipeline.retrieve('q', {
      depth: 5,
      filter,
      rerank: false,
      search: { mode: 'ann', efSearch: 64 },
    });

    expect(store.search).toHaveBeenCalledWith([0.1, 0.2], {
      topK: 50,
      filter,
      mode: 'ann',
      efSearch: 64,
    });
    expect(bm25.search).toHaveBeenCalledWith('q', 50, filter);
  });

  it('repeats the search without the filter when it matches nothing', async () => {
    const { pipeline, store } = build();
    store.search
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([chunk('a', 0.9)]);

    const result = await pipeline.retrieve('q', {
      depth: 5,
      filter: { salaryAtLeast: 900000 },
      rerank: false,
    });

    expect(result.filterRelaxed).toBe(true);
    expect(ids(result)).toEqual(['a']);
    expect(store.search).toHaveBeenLastCalledWith(
      [0.1, 0.2],
      expect.objectContaining({ filter: undefined }),
    );
  });

  it('reranks a pool of RERANK_CANDIDATES and returns the top depth', async () => {
    const dense = ['a', 'b', 'c', 'd'].map((id, i) => chunk(id, 0.9 - i / 10));
    const { pipeline, reranker } = build({
      dense,
      env: { RERANK_CANDIDATES: '3' },
      // The reranker prefers the job the dense search ranked last in the pool.
      rerankScores: (docs) =>
        docs.map((d) => (d.includes('Title c') ? 0.9 : 0.1)),
    });

    const result = await pipeline.retrieve('q', { depth: 2, hybrid: false });

    expect(reranker.score.mock.calls[0][1]).toHaveLength(3);
    expect(ids(result)).toEqual(['c', 'a']);
    expect(result.reranked).toBe(true);
    expect(result.hits[0].score).toBe(0.9);
  });

  it('fuses the first-stage and rerank orders with rrf fusion', async () => {
    const { pipeline } = build({
      dense: ['a', 'b', 'c'].map((id, i) => chunk(id, 0.9 - i / 10)),
      // The reranker reverses the first-stage order.
      rerankScores: (docs) =>
        docs.map((d) =>
          d.includes('Title c') ? 0.9 : d.includes('Title b') ? 0.5 : 0.1,
        ),
    });

    const replace = await pipeline.retrieve('q', { depth: 3, hybrid: false });
    const rrf = await pipeline.retrieve('q', {
      depth: 3,
      hybrid: false,
      rerankFusion: 'rrf',
    });

    expect(ids(replace)).toEqual(['c', 'b', 'a']);
    // a: 1/61 + 1/63 = c: 1/63 + 1/61 > b: 2/62; the tie keeps the
    // first-stage order.
    expect(ids(rrf)).toEqual(['a', 'c', 'b']);
    expect(rrf.hits.map((h) => h.rerankScore)).toEqual([0.1, 0.9, 0.5]);
  });

  it('takes the number of reranked candidates per call', async () => {
    const dense = ['a', 'b', 'c', 'd'].map((id, i) => chunk(id, 0.9 - i / 10));
    const { pipeline, reranker } = build({ dense });

    await pipeline.retrieve('q', {
      depth: 1,
      hybrid: false,
      rerankCandidates: 2,
    });

    expect(reranker.score.mock.calls[0][1]).toHaveLength(2);
  });

  it('returns no hits when even the best job is below the minimum score', async () => {
    const { pipeline } = build({
      dense: [chunk('a', 0.9), chunk('b', 0.8)],
      rerankScores: (docs) => docs.map(() => 0.05),
    });

    const result = await pipeline.retrieve('q', {
      depth: 5,
      hybrid: false,
      minRerankScore: 0.1,
    });

    expect(result.hits).toEqual([]);
  });

  it('keeps every job when the best one reaches the minimum score', async () => {
    const { pipeline } = build({
      dense: [chunk('a', 0.9), chunk('b', 0.8)],
      rerankScores: (docs) =>
        docs.map((d) => (d.includes('Title a') ? 0.8 : 0.01)),
    });

    const result = await pipeline.retrieve('q', {
      depth: 5,
      hybrid: false,
      minRerankScore: 0.1,
    });

    expect(ids(result)).toEqual(['a', 'b']);
  });

  it('keeps the fused order when the reranker fails', async () => {
    const { pipeline, reranker } = build({
      dense: [chunk('a', 0.9), chunk('b', 0.8)],
    });
    reranker.score.mockRejectedValueOnce(new Error('down'));

    const result = await pipeline.retrieve('q', { depth: 5, hybrid: false });

    expect(ids(result)).toEqual(['a', 'b']);
    expect(result.reranked).toBe(false);
  });

  it('fails when the reranker is down and strictRerank is set', async () => {
    const { pipeline, reranker } = build({ dense: [chunk('a', 0.9)] });
    reranker.score.mockRejectedValueOnce(new Error('down'));

    await expect(
      pipeline.retrieve('q', { depth: 5, strictRerank: true }),
    ).rejects.toThrow('down');
  });

  it('uses a precomputed query vector without embedding again', async () => {
    const { pipeline, embedding, store } = build({ dense: [chunk('a', 0.9)] });

    await pipeline.retrieve('q', {
      depth: 5,
      queryVector: [0.5],
      rerank: false,
      hybrid: false,
    });

    expect(embedding.embedQuery).not.toHaveBeenCalled();
    expect(store.search).toHaveBeenCalledWith([0.5], expect.anything());
  });

  it('takes the defaults for hybrid and rerank from the configuration', async () => {
    const { pipeline, bm25, reranker } = build({
      dense: [chunk('a', 0.9)],
      env: { RETRIEVAL_HYBRID: 'false', RERANK_ENABLED: 'false' },
    });

    await pipeline.retrieve('q', { depth: 5 });

    expect(bm25.search).not.toHaveBeenCalled();
    expect(reranker.score).not.toHaveBeenCalled();
  });

  it('returns no hits without fetching when nothing is retrieved', async () => {
    const { pipeline, jobs } = build();

    const result = await pipeline.retrieve('q', { depth: 5 });

    expect(result.hits).toEqual([]);
    expect(jobs.findByIds).not.toHaveBeenCalled();
  });
});

describe('rerankDocument', () => {
  it('starts with the job header and is capped at 2000 characters', () => {
    const doc = rerankDocument({
      job: job('a') as never,
      chunks: [{ ...chunk('a', 0.9), chunkText: 'x'.repeat(5000) }],
    });
    expect(doc.startsWith('Title a at Co a | Location: Remote')).toBe(true);
    expect(doc.length).toBe(2000);
  });
});
