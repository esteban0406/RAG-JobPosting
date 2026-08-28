import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

const mockCreate = jest.fn();

jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

import { LlmService } from '../../../src/llm/llm.service.js';

const mockConfig = {
  get: jest.fn((key: string, fallback?: unknown) => {
    if (key === 'GROQ_API_KEY') return 'test-key';
    if (key === 'GROQ_API_KEY2') return undefined;
    if (key === 'LLM_MODEL') return fallback ?? 'qwen/qwen3.6-27b';
    return fallback;
  }),
};

async function buildModule(): Promise<LlmService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      LlmService,
      { provide: ConfigService, useValue: mockConfig },
    ],
  }).compile();
  return module.get(LlmService);
}

describe('LlmService', () => {
  let service: LlmService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildModule();
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
