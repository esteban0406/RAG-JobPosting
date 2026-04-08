import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from '../llm/llm.service.js';
import { QueryClassifierService } from './query-classifier.service.js';

const mockLlm = { complete: jest.fn() };

async function buildModule(): Promise<QueryClassifierService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      QueryClassifierService,
      { provide: LlmService, useValue: mockLlm },
    ],
  }).compile();
  return module.get(QueryClassifierService);
}

describe('QueryClassifierService', () => {
  let service: QueryClassifierService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildModule();
  });

  describe('rule-based fast path', () => {
    it('classifies aggregation signals without LLM', async () => {
      const result = await service.classify(
        'how many remote jobs are available',
      );
      expect(result.type).toBe('aggregation');
      expect(mockLlm.complete).not.toHaveBeenCalled();
    });

    it('classifies retrieval signals without LLM', async () => {
      const result = await service.classify('find python developer jobs');
      expect(result.type).toBe('retrieval');
      expect(mockLlm.complete).not.toHaveBeenCalled();
    });

    it('classifies hybrid when both signals match', async () => {
      const result = await service.classify(
        'find frontend jobs and how many are remote',
      );
      expect(result.type).toBe('hybrid');
      expect(mockLlm.complete).not.toHaveBeenCalled();
    });

    it('detects "types of" as aggregation signal', async () => {
      const result = await service.classify('what types of driving jobs exist');
      expect(result.type).toBe('aggregation');
    });

    it('detects "list all" as aggregation signal', async () => {
      const result = await service.classify('list all available locations');
      expect(result.type).toBe('aggregation');
    });
  });

  describe('LLM fallback for ambiguous queries', () => {
    it('calls LLM when no rule matches', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"retrieval","intent":null,"params":[]}',
      );
      const result = await service.classify('software engineer opportunities');
      expect(mockLlm.complete).toHaveBeenCalledTimes(1);
      expect(result.type).toBe('retrieval');
    });

    it('parses valid LLM aggregation response with intent and params', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"aggregation","intent":"count_by_location","params":["New York"]}',
      );
      const result = await service.classify('jobs near me breakdown');
      expect(result.type).toBe('aggregation');
      expect(result.intent).toBe('count_by_location');
      expect(result.params).toEqual(['New York']);
    });

    it('parses valid LLM hybrid response', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"hybrid","intent":"count_by_job_type","params":[]}',
      );
      const result = await service.classify(
        'interesting nurse opportunities and stats',
      );
      expect(result.type).toBe('hybrid');
      expect(result.intent).toBe('count_by_job_type');
    });

    it('defaults to retrieval when LLM throws', async () => {
      mockLlm.complete.mockRejectedValueOnce(new Error('rate limit'));
      const result = await service.classify('something ambiguous');
      expect(result.type).toBe('retrieval');
    });

    it('defaults to retrieval when LLM returns malformed JSON', async () => {
      mockLlm.complete.mockResolvedValueOnce('not valid json at all');
      const result = await service.classify('something ambiguous');
      expect(result.type).toBe('retrieval');
    });

    it('defaults to retrieval when LLM returns unknown type value', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"unknown","intent":null}',
      );
      const result = await service.classify('something ambiguous');
      expect(result.type).toBe('retrieval');
    });

    it('ignores unknown intent keys from LLM', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"aggregation","intent":"drop_table","params":[]}',
      );
      const result = await service.classify('something ambiguous');
      expect(result.type).toBe('aggregation');
      expect(result.intent).toBeUndefined();
    });
  });
});
