import { PipelineSystem } from '../../../src/eval/systems/pipeline.system.js';
import type { RetrievalPipeline } from '../../../src/retrieval/retrieval-pipeline.service.js';

describe('PipelineSystem', () => {
  it('runs the pipeline with the query filter and strict, uncut reranking', async () => {
    const pipeline = {
      retrieve: jest.fn().mockResolvedValue({
        hits: [
          { job: { id: 'a' }, score: 0.9, rerankScore: 0.9 },
          { job: { id: 'b' }, score: 0.4, rerankScore: 0.4 },
        ],
      }),
    };
    const system = new PipelineSystem(
      'qdrant-hybrid-rerank',
      pipeline as unknown as RetrievalPipeline,
      () => Promise.resolve([0.1]),
      {
        hybrid: true,
        rerank: true,
        filterFor: () => Promise.resolve({ isRemote: true }),
        search: { mode: 'ann', efSearch: 40 },
      },
    );

    const jobs = await system.retrieve('remote python', 10);

    expect(jobs).toEqual([
      { jobId: 'a', score: 0.9, rerankScore: 0.9 },
      { jobId: 'b', score: 0.4, rerankScore: 0.4 },
    ]);
    expect(pipeline.retrieve).toHaveBeenCalledWith('remote python', {
      depth: 10,
      filter: { isRemote: true },
      hybrid: true,
      rerank: true,
      queryVector: [0.1],
      search: { mode: 'ann', efSearch: 40 },
      rerankFusion: undefined,
      rerankCandidates: undefined,
      strictRerank: true,
      minRerankScore: Number.NEGATIVE_INFINITY,
    });
  });
});
