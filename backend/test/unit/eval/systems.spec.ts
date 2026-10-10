import {
  DenseSystem,
  memoizedEmbedder,
} from '../../../src/eval/systems/dense.system.js';
import { Bm25System } from '../../../src/eval/systems/bm25.system.js';
import { IlikeSystem } from '../../../src/eval/systems/ilike.system.js';
import { rankJobsFromChunks } from '../../../src/rag/job-ranking.js';
import type { JobRepository } from '../../../src/storage/job.repository.js';
import type { VectorStore } from '../../../src/storage/vector-store/vector-store.interface.js';

const chunk = (id: string, jobId: string, similarity: number) => ({
  id,
  jobId,
  chunkType: 'identity',
  chunkText: id,
  embeddingModel: 'e5',
  similarity,
});

describe('rankJobsFromChunks', () => {
  it('scores each job by its best chunk and orders jobs by that score', () => {
    const ranked = rankJobsFromChunks([
      chunk('c1', 'job-a', 0.7),
      chunk('c2', 'job-b', 0.9),
      chunk('c3', 'job-a', 0.95),
    ]);
    expect(ranked.map((r) => [r.jobId, r.score])).toEqual([
      ['job-a', 0.95],
      ['job-b', 0.9],
    ]);
    expect(ranked[0].chunks.map((c) => c.id)).toEqual(['c3', 'c1']);
  });
});

describe('DenseSystem', () => {
  it('searches 50 chunks with its options and returns the top jobs', async () => {
    const store = {
      search: jest
        .fn()
        .mockResolvedValue([
          chunk('c1', 'job-a', 0.9),
          chunk('c2', 'job-b', 0.8),
          chunk('c3', 'job-c', 0.7),
        ]),
    } as unknown as VectorStore;
    const system = new DenseSystem(
      'qdrant-hnsw',
      store,
      () => Promise.resolve([0.1]),
      {
        mode: 'ann',
        efSearch: 64,
      },
    );

    const result = await system.retrieve('python', 2);

    expect(store.search).toHaveBeenCalledWith([0.1], {
      topK: 50,
      mode: 'ann',
      efSearch: 64,
    });
    expect(result).toEqual([
      { jobId: 'job-a', score: 0.9 },
      { jobId: 'job-b', score: 0.8 },
    ]);
  });

  it('embeds each distinct query once when memoized', async () => {
    const embed = jest.fn().mockResolvedValue([0.1]);
    const memo = memoizedEmbedder(embed);
    await memo('python');
    await memo('python');
    await memo('react');
    expect(embed).toHaveBeenCalledTimes(2);
  });
});

describe('lexical systems', () => {
  it('BM25 ranks jobs over title, skills and description', async () => {
    const system = new Bm25System([
      {
        id: 'a',
        title: 'Data Engineer',
        skills: ['Spark'],
        description: 'Pipelines',
      },
      { id: 'b', title: 'Designer', skills: ['Figma'], description: 'UI work' },
    ]);
    await expect(system.retrieve('spark pipelines', 10)).resolves.toEqual([
      { jobId: 'a', score: expect.any(Number) },
    ]);
  });

  it('ILIKE delegates to the platform keyword filter', async () => {
    const jobs = {
      findAll: jest.fn().mockResolvedValue([{ id: 'x' }, { id: 'y' }]),
    } as unknown as JobRepository;
    const result = await new IlikeSystem(jobs).retrieve('react', 10);
    expect(jobs.findAll).toHaveBeenCalledWith({ keyword: 'react', limit: 10 });
    expect(result).toEqual([
      { jobId: 'x', score: 1 },
      { jobId: 'y', score: 0.5 },
    ]);
  });
});
