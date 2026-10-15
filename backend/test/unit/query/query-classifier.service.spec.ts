import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from '../../../src/llm/llm.service.js';
import { QueryClassifierService } from '../../../src/query/query-classifier.service.js';

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
    it('uses the LLM to pick the template when only aggregation signals match', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"aggregation","intent":"count_remote","params":[]}',
      );
      const result = await service.classify(
        'how many remote jobs are available',
      );
      expect(result.type).toBe('aggregation');
      expect(result.intent).toBe('count_remote');
      expect(mockLlm.complete).toHaveBeenCalledTimes(1);
    });

    it('falls back to retrieval when an aggregation query gets no template', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"aggregation","intent":null,"params":[]}',
      );
      const result = await service.classify('what is the average salary');
      expect(result.type).toBe('retrieval');
      expect(result.intent).toBeUndefined();
    });

    it('routes a filter_jobs answer to retrieval with its filters', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"aggregation","intent":"filter_jobs","filters":{"minSalary":150000}}',
      );
      const result = await service.classify('salary above 150k for devops');
      expect(result.type).toBe('retrieval');
      expect(result.intent).toBe('filter_jobs');
      expect(result.filters).toEqual(
        expect.objectContaining({ minSalary: 150000 }),
      );
    });

    it('routes statistic templates to aggregation even if the LLM says retrieval', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"retrieval","intent":"recent_jobs","params":[]}',
      );
      const result = await service.classify(
        'what are the most recent job postings',
      );
      expect(result.type).toBe('aggregation');
      expect(result.intent).toBe('recent_jobs');
    });

    it('keeps listing templates on retrieval when the LLM says retrieval', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"retrieval","intent":"list_jobs_by_title","params":["%product manager%"]}',
      );
      const result = await service.classify('product manager');
      expect(result.type).toBe('retrieval');
    });

    it('classifies retrieval signals without LLM', async () => {
      const result = await service.classify('find python developer jobs');
      expect(result.type).toBe('retrieval');
      expect(mockLlm.complete).not.toHaveBeenCalled();
    });

    it.each([
      'find remote python jobs',
      'find python jobs paying over 150k',
      'looking for contract frontend work',
      'find an internship in software engineering',
    ])('sends retrieval queries with constraints to the LLM: %s', async (q) => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"retrieval","intent":"filter_jobs","filters":{"isRemote":true}}',
      );
      const result = await service.classify(q);
      expect(mockLlm.complete).toHaveBeenCalledTimes(1);
      expect(result.type).toBe('retrieval');
      expect(result.filters?.isRemote).toBe(true);
    });

    it('extracts constraints from Spanish queries through the LLM', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"retrieval","intent":"filter_jobs","filters":{"title":"%backend%","minSalary":150000,"isRemote":true}}',
      );
      const result = await service.classify(
        'trabajos remotos de backend en python que paguen más de 150 mil',
      );
      expect(result).toEqual({
        type: 'retrieval',
        intent: 'filter_jobs',
        filters: {
          title: '%backend%',
          minSalary: 150000,
          maxSalary: undefined,
          location: undefined,
          jobType: undefined,
          isRemote: true,
        },
      });
    });

    it('treats filter_jobs as retrieval even when both regex signals match', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"hybrid","intent":"filter_jobs","filters":{"jobType":"contract"}}',
      );
      const result = await service.classify(
        'find contract jobs and their average salary',
      );
      expect(result.type).toBe('retrieval');
      expect(result.filters?.jobType).toBe('contract');
    });

    it('classifies hybrid when both signals match, calling LLM for intent', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"hybrid","intent":"count_remote","params":[]}',
      );
      const result = await service.classify(
        'find frontend jobs and how many are remote',
      );
      expect(result.type).toBe('hybrid');
      expect(mockLlm.complete).toHaveBeenCalledTimes(1);
    });

    it('detects "types of" as aggregation signal', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"aggregation","intent":"list_distinct_titles","params":["%driving%"]}',
      );
      const result = await service.classify('what types of driving jobs exist');
      expect(result.type).toBe('aggregation');
    });

    it('detects "list all" as aggregation signal', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"aggregation","intent":"list_distinct_locations","params":[]}',
      );
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
      expect(result.type).toBe('retrieval');
      expect(result.intent).toBeUndefined();
    });
  });
});
