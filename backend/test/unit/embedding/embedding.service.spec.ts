import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from '../../../src/embedding/embedding.service.js';

const DIM = 768;
const vector = (x: number): number[] => new Array<number>(DIM).fill(x);

function buildService(env: Record<string, string> = {}) {
  const config = {
    get: (key: string, fallback?: unknown) => env[key] ?? fallback,
    getOrThrow: (key: string) => env[key],
  } as unknown as ConfigService;
  const store = new Map<string, unknown>();
  const cache = {
    get: jest.fn((key: string) => Promise.resolve(store.get(key))),
    set: jest.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  };
  return { service: new EmbeddingService(config, cache as never), cache };
}

function mockServer(model: string) {
  return jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
    const body = JSON.parse(init?.body as string) as { texts: string[] };
    return Promise.resolve(
      new Response(
        JSON.stringify({
          model,
          embeddings: body.texts.map(() => vector(0.1)),
        }),
      ),
    );
  });
}

describe('EmbeddingService (local provider)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports the configured local model, multilingual-e5-base by default', () => {
    expect(buildService().service.modelName).toBe('multilingual-e5-base');
    expect(
      buildService({ LOCAL_EMBEDDING_MODEL: 'e5-base-v2' }).service.modelName,
    ).toBe('e5-base-v2');
  });

  it('accepts vectors from the configured model', async () => {
    mockServer('intfloat/multilingual-e5-base');
    const { service } = buildService();

    await expect(service.embedQuery('python jobs')).resolves.toHaveLength(DIM);
  });

  it('rejects vectors from a different model than the configured one', async () => {
    mockServer('intfloat/e5-base-v2');
    const { service } = buildService();

    await expect(service.embedQuery('python jobs')).rejects.toThrow(
      'expected "multilingual-e5-base"',
    );
  });

  it('keys the cache by model so a model switch never serves stale vectors', async () => {
    mockServer('intfloat/multilingual-e5-base');
    const { service, cache } = buildService();

    await service.embed('same text');

    const key = cache.set.mock.calls[0][0];
    expect(key).toMatch(/^embed:multilingual-e5-base:[0-9a-f]{64}$/);
  });

  it('embeds in batches of 32 texts per request, in order', async () => {
    const fetchSpy = mockServer('intfloat/multilingual-e5-base');
    const { service } = buildService();
    const texts = Array.from({ length: 70 }, (_, i) => `chunk ${i}`);

    const vectors = await service.embedBatch(texts);

    expect(vectors).toHaveLength(70);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const sizes = fetchSpy.mock.calls.map(
      ([, init]) =>
        (JSON.parse(init?.body as string) as { texts: string[] }).texts.length,
    );
    expect(sizes).toEqual([32, 32, 6]);
  });
});
