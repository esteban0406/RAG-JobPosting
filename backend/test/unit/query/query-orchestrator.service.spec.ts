import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../generated/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  })),
}));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));
import { LlmService } from '../../../src/llm/llm.service.js';
import { RagService } from '../../../src/rag/rag.service.js';
import { AggregationService } from '../../../src/query/aggregation/aggregation.service.js';
import { SearchQueryDto } from '../../../src/query/dto/search-query.dto.js';
import { QueryClassifierService } from '../../../src/query/query-classifier.service.js';
import { QueryOrchestratorService } from '../../../src/query/query-orchestrator.service.js';

const mockClassifier = { classify: jest.fn() };
const mockRag = {
  query: jest.fn(),
  buildContext: jest.fn(),
  buildMessages: jest.fn(),
};
const mockAggregation = {
  execute: jest.fn(),
  queryRaw: jest.fn(),
  executeStream: jest.fn(),
};
const mockLlm = { completeChat: jest.fn(), completeChatStream: jest.fn() };

const RAG_SOURCES = [
  {
    jobId: '1',
    title: 'Engineer',
    company: 'Acme',
    url: 'http://example.com',
    similarity: 0.9,
  },
];

const RAG_RESULT = {
  answer: 'Here are some jobs.',
  sources: RAG_SOURCES,
  retrievedAt: new Date('2026-01-01'),
};

const RAG_CTX = {
  systemMessage: 'Job context system message...',
  sources: RAG_SOURCES,
  contextChunks:
    '---\nJob: Engineer at Acme | Similarity: 0.90\nDescription...',
};

const AGG_RESULT = {
  intent: 'count_by_location' as const,
  rows: [{ location: 'NYC', count: 5 }],
  summary: 'There are 5 jobs in NYC.',
};

function makeDto(query = 'test query'): SearchQueryDto {
  const dto = new SearchQueryDto();
  dto.query = query;
  return dto;
}

async function buildModule(): Promise<QueryOrchestratorService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      QueryOrchestratorService,
      { provide: QueryClassifierService, useValue: mockClassifier },
      { provide: RagService, useValue: mockRag },
      { provide: AggregationService, useValue: mockAggregation },
      { provide: LlmService, useValue: mockLlm },
    ],
  }).compile();
  return module.get(QueryOrchestratorService);
}

describe('QueryOrchestratorService', () => {
  let service: QueryOrchestratorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRag.buildMessages.mockImplementation(
      (systemMessage: string, history: unknown[], userQuery: string) => [
        { role: 'system', content: systemMessage },
        ...history,
        { role: 'user', content: userQuery },
      ],
    );
    service = await buildModule();
  });

  describe('retrieval routing', () => {
    it('calls only RagService and returns type=retrieval', async () => {
      mockClassifier.classify.mockResolvedValueOnce({ type: 'retrieval' });
      mockRag.query.mockResolvedValueOnce(RAG_RESULT);

      const result = await service.handle(makeDto());

      expect(result.type).toBe('retrieval');
      expect(result.answer).toBe(RAG_RESULT.answer);
      expect(result.sources).toEqual(RAG_RESULT.sources);
      expect((result as { aggregation?: unknown }).aggregation).toBeUndefined();
      expect(mockAggregation.execute).not.toHaveBeenCalled();
      expect(mockAggregation.queryRaw).not.toHaveBeenCalled();
    });

    it('forwards location and type filters to RagService', async () => {
      mockClassifier.classify.mockResolvedValueOnce({ type: 'retrieval' });
      mockRag.query.mockResolvedValueOnce(RAG_RESULT);

      const dto = makeDto();
      dto.location = 'Austin';

      await service.handle(dto);

      expect(mockRag.query).toHaveBeenCalledWith(
        dto.query,
        { location: 'Austin', jobType: undefined },
        undefined,
        undefined,
        [],
      );
    });
  });

  describe('aggregation routing', () => {
    it('calls only AggregationService and returns type=aggregation', async () => {
      mockClassifier.classify.mockResolvedValueOnce({
        type: 'aggregation',
        intent: 'count_by_location',
        params: [],
      });
      mockAggregation.execute.mockResolvedValueOnce(AGG_RESULT);

      const result = await service.handle(makeDto('how many jobs in NYC'));

      expect(result.type).toBe('aggregation');
      expect(result.answer).toBe(AGG_RESULT.summary);
      expect((result as { aggregation?: unknown }).aggregation).toBeUndefined();
      expect(mockRag.query).not.toHaveBeenCalled();
    });
  });

  describe('hybrid routing', () => {
    it('runs both pipelines and calls LLM once for combined answer', async () => {
      mockClassifier.classify.mockResolvedValueOnce({
        type: 'hybrid',
        intent: 'count_by_location',
        params: [],
      });
      mockRag.buildContext.mockResolvedValueOnce(RAG_CTX);
      mockAggregation.queryRaw.mockResolvedValueOnce(AGG_RESULT.rows);
      mockLlm.completeChat.mockResolvedValueOnce('Combined answer.');

      const result = await service.handle(makeDto());

      expect(result.type).toBe('hybrid');
      expect(result.answer).toBe('Combined answer.');
      expect(result.sources).toEqual(RAG_SOURCES);
      expect((result as { aggregation?: unknown }).aggregation).toBeUndefined();
      expect(mockLlm.completeChat).toHaveBeenCalledTimes(1);
      expect(mockAggregation.execute).not.toHaveBeenCalled();
    });

    it('passes full job context (contextChunks) to the hybrid LLM prompt', async () => {
      mockClassifier.classify.mockResolvedValueOnce({
        type: 'hybrid',
        intent: 'count_by_location',
        params: [],
      });
      mockRag.buildContext.mockResolvedValueOnce(RAG_CTX);
      mockAggregation.queryRaw.mockResolvedValueOnce(AGG_RESULT.rows);
      mockLlm.completeChat.mockResolvedValueOnce('Answer with context.');

      await service.handle(makeDto());

      const messagesArg = mockLlm.completeChat.mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      const systemMsg = messagesArg.find((m) => m.role === 'system');
      expect(systemMsg?.content).toContain(RAG_CTX.contextChunks);
    });

    it('degrades to aggregation-only when RagService fails', async () => {
      mockClassifier.classify.mockResolvedValueOnce({
        type: 'hybrid',
        intent: 'count_by_location',
        params: [],
      });
      mockRag.buildContext.mockRejectedValueOnce(new Error('vector DB down'));
      mockAggregation.queryRaw.mockResolvedValueOnce(AGG_RESULT.rows);
      mockAggregation.execute.mockResolvedValueOnce(AGG_RESULT);

      const result = await service.handle(makeDto());

      expect(result.type).toBe('aggregation');
      expect(result.answer).toBe(AGG_RESULT.summary);
      expect(result.sources).toBeUndefined();
      expect(mockLlm.completeChat).not.toHaveBeenCalled();
    });

    it('degrades to retrieval-only when AggregationService fails', async () => {
      mockClassifier.classify.mockResolvedValueOnce({
        type: 'hybrid',
        intent: 'count_by_location',
        params: [],
      });
      mockRag.buildContext.mockResolvedValueOnce(RAG_CTX);
      mockAggregation.queryRaw.mockRejectedValueOnce(new Error('DB timeout'));
      mockLlm.completeChat.mockResolvedValueOnce('Retrieval answer.');

      const result = await service.handle(makeDto());

      expect(result.type).toBe('retrieval');
      expect(result.answer).toBe('Retrieval answer.');
      expect((result as { aggregation?: unknown }).aggregation).toBeUndefined();
      expect(mockLlm.completeChat).toHaveBeenCalledTimes(1);
      expect(mockRag.buildMessages).toHaveBeenCalledWith(
        RAG_CTX.systemMessage,
        [],
        expect.any(String),
      );
    });
  });
});
