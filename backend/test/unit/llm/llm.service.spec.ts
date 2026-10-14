import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

const mockCreate = jest.fn();
// API key of the client behind each create() call.
const keysUsed: string[] = [];

jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(({ apiKey }: { apiKey: string }) => ({
    chat: {
      completions: {
        create: (...args: unknown[]) => {
          keysUsed.push(apiKey);
          return mockCreate(...args) as unknown;
        },
      },
    },
  }));
});

import { LlmService } from '../../../src/llm/llm.service.js';

const mockConfig = {
  get: jest.fn((key: string, fallback?: unknown) => {
    if (key === 'GROQ_API_KEY') return 'test-key';
    if (key === 'GROQ_API_KEY2') return undefined;
    if (key === 'LLM_MODEL') return fallback ?? 'qwen/qwen3.8-27b';
    return fallback;
  }),
};

async function buildModule(): Promise<LlmService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [LlmService, { provide: ConfigService, useValue: mockConfig }],
  }).compile();
  return module.get(LlmService);
}

describe('LlmService', () => {
  let service: LlmService;

  beforeEach(async () => {
    jest.clearAllMocks();
    keysUsed.length = 0;
    service = await buildModule();
  });

  describe('completeChatStream', () => {
    it('sends the retry after a rate limit through the next key', async () => {
      const original = mockConfig.get.getMockImplementation()!;
      mockConfig.get.mockImplementation((key: string, fallback?: unknown) =>
        key === 'GROQ_API_KEY'
          ? 'key-1'
          : key === 'GROQ_API_KEY2'
            ? 'key-2'
            : fallback,
      );
      const twoKeys = await buildModule();
      mockCreate.mockRejectedValueOnce({ status: 429 });
      mockCreate.mockResolvedValueOnce(
        (async function* () {
          yield { choices: [{ delta: { content: 'ok' } }] };
        })(),
      );

      const drain = async () => {
        let out = '';
        for await (const t of twoKeys.completeChatStream([
          { role: 'user', content: 'q' },
        ]))
          out += t;
        return out;
      };
      await expect(drain()).rejects.toMatchObject({ status: 429 });
      await expect(drain()).resolves.toBe('ok');

      expect(keysUsed).toEqual(['key-1', 'key-2']);
      mockConfig.get.mockImplementation(original);
    });
  });

  describe('completeChat', () => {
    it('sends the given messages with reasoning_format hidden', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Here is the answer.' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const messages = [
        { role: 'system' as const, content: 'You are helpful.' },
        { role: 'user' as const, content: 'why is job 1 good?' },
      ];
      const result = await service.completeChat(messages);

      expect(result).toBe('Here is the answer.');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages,
          reasoning_format: 'hidden',
          reasoning_effort: 'none',
          stream: false,
        }),
      );
    });

    it('strips a leaked <think> block as a defensive fallback', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          { message: { content: '<think>reasoning...</think>Real answer.' } },
        ],
        usage: {},
      });

      const result = await service.completeChat([
        { role: 'user', content: 'hi' },
      ]);

      expect(result).toBe('Real answer.');
    });
  });

  describe('complete', () => {
    it('wraps a single prompt string into a one-message chat call', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Answer.' } }],
        usage: {},
      });

      await service.complete('find me a job');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'find me a job' }],
        }),
      );
    });
  });
});
