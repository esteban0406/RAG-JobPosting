import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../generated/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  })),
}));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));
import { LlmService } from '../llm/llm.service.js';
import { RagService } from '../rag/rag.service.js';
import { AggregationService } from './aggregation/aggregation.service.js';
import { SearchQueryDto } from './dto/search-query.dto.js';
import { QueryClassifierService } from './query-classifier.service.js';
import { QueryOrchestratorService } from './query-orchestrator.service.js';

const mockClassifier = { classify: jest.fn() };
const mockRag = { query: jest.fn() };
const mockAggregation = { execute: jest.fn(), queryRaw: jest.fn() };
const mockLlm = { complete: jest.fn() };

const RAG_RESULT = {
  answer: 'Here are some jobs.',
  sources: [
    {
      jobId: '1',
      title: 'Engineer',
      company: 'Acme',
      url: 'http://example.com',
      similarity: 0.9,
    },
  ],
  retrievedAt: new Date('2026-01-01'),
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
      expect(result.aggregation).toBeUndefined();
      expect(mockAggregation.execute).not.toHaveBeenCalled();
      expect(mockAggregation.queryRaw).not.toHaveBeenCalled();
    });

    it('forwards location and type filters to RagService', async () => {
      mockClassifier.classify.mockResolvedValueOnce({ type: 'retrieval' });
      mockRag.query.mockResolvedValueOnce(RAG_RESULT);

      const dto = makeDto();
      dto.location = 'Austin';

      await service.handle(dto);

      expect(mockRag.query).toHaveBeenCalledWith(dto.query, {
        location: 'Austin',
        jobType: undefined,
      });
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
      expect(result.aggregation?.rows).toEqual(AGG_RESULT.rows);
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
      mockRag.query.mockResolvedValueOnce(RAG_RESULT);
      mockAggregation.queryRaw.mockResolvedValueOnce(AGG_RESULT.rows);
      mockLlm.complete.mockResolvedValueOnce('Combined answer.');

      const result = await service.handle(makeDto());

      expect(result.type).toBe('hybrid');
      expect(result.answer).toBe('Combined answer.');
      expect(result.sources).toEqual(RAG_RESULT.sources);
      expect(result.aggregation?.rows).toEqual(AGG_RESULT.rows);
      expect(mockLlm.complete).toHaveBeenCalledTimes(1);
      expect(mockAggregation.execute).not.toHaveBeenCalled();
    });

    it('degrades to aggregation-only when RagService fails', async () => {
      mockClassifier.classify.mockResolvedValueOnce({
        type: 'hybrid',
        intent: 'count_by_location',
        params: [],
      });
      mockRag.query.mockRejectedValueOnce(new Error('vector DB down'));
      mockAggregation.queryRaw.mockResolvedValueOnce(AGG_RESULT.rows);
      mockAggregation.execute.mockResolvedValueOnce(AGG_RESULT);

      const result = await service.handle(makeDto());

      expect(result.type).toBe('aggregation');
      expect(result.answer).toBe(AGG_RESULT.summary);
      expect(result.sources).toBeUndefined();
      expect(mockLlm.complete).not.toHaveBeenCalled();
    });

    it('degrades to retrieval-only when AggregationService fails', async () => {
      mockClassifier.classify.mockResolvedValueOnce({
        type: 'hybrid',
        intent: 'count_by_location',
        params: [],
      });
      mockRag.query.mockResolvedValueOnce(RAG_RESULT);
      mockAggregation.queryRaw.mockRejectedValueOnce(new Error('DB timeout'));

      const result = await service.handle(makeDto());

      expect(result.type).toBe('retrieval');
      expect(result.answer).toBe(RAG_RESULT.answer);
      expect(result.aggregation).toBeUndefined();
      expect(mockLlm.complete).not.toHaveBeenCalled();
    });
  });
});
