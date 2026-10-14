import type { ConfigService } from '@nestjs/config';
import { RerankService } from '../../../src/retrieval/rerank.service.js';

const config = (env: Record<string, string>) =>
  ({
    get: (key: string, fallback?: unknown) => env[key] ?? fallback,
  }) as unknown as ConfigService;

describe('RerankService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('posts the query and documents to /rerank on the embedding server', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ scores: [0.9, 0.1], model: 'bge' })),
      );
    const service = new RerankService(
      config({ LOCAL_EMBEDDING_URL: 'http://embed:8000' }),
    );

    const result = await service.score('q', ['d1', 'd2']);

    expect(result).toEqual({ scores: [0.9, 0.1], model: 'bge' });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://embed:8000/rerank');
    expect(JSON.parse(init?.body as string)).toEqual({
      query: 'q',
      documents: ['d1', 'd2'],
    });
  });

  it('sends RERANK_INSTRUCTION to instruction-aware rerankers', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ scores: [1] })));
    const service = new RerankService(
      config({ RERANK_INSTRUCTION: 'Judge job postings' }),
    );

    await service.score('q', ['d']);

    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)).toEqual({
      query: 'q',
      documents: ['d'],
      instruction: 'Judge job postings',
    });
  });

  it('prefers RERANKER_URL when set', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ scores: [1] })));
    const service = new RerankService(
      config({ RERANKER_URL: 'http://gpu:9000' }),
    );

    await service.score('q', ['d']);

    expect(fetchSpy.mock.calls[0][0]).toBe('http://gpu:9000/rerank');
  });

  it('rejects scores from a model other than RERANKER_MODEL', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ scores: [1], model: 'BAAI/bge' })),
      );
    const service = new RerankService(
      config({ RERANKER_MODEL: 'Qwen/Qwen3-Reranker-0.6B' }),
    );

    await expect(service.score('q', ['d'])).rejects.toThrow(
      'expected "Qwen/Qwen3-Reranker-0.6B"',
    );
  });

  it('rejects a response with the wrong number of scores', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ scores: [1] })));
    const service = new RerankService(config({}));

    await expect(service.score('q', ['d1', 'd2'])).rejects.toThrow(
      '1 scores for 2 documents',
    );
  });

  it('throws when the server answers with an error status', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('no', { status: 404 }));
    const service = new RerankService(config({}));

    await expect(service.score('q', ['d'])).rejects.toThrow(
      'Reranker returned 404',
    );
  });

  it('skips the call when there is nothing to rerank', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new RerankService(config({}));

    await expect(service.score('q', [])).resolves.toEqual({
      scores: [],
      model: '',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
