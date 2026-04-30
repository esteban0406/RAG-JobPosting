import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../generated/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  })),
}));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));
import { LlmService } from '../../llm/llm.service.js';
import { AggregationRepository } from './aggregation.repository.js';
import { AggregationService } from './aggregation.service.js';

const mockRepo = { execute: jest.fn() };
const mockLlm = { complete: jest.fn() };

async function buildModule(): Promise<AggregationService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AggregationService,
      { provide: AggregationRepository, useValue: mockRepo },
      { provide: LlmService, useValue: mockLlm },
    ],
  }).compile();
  return module.get(AggregationService);
}

describe('AggregationService', () => {
  let service: AggregationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildModule();
  });

  describe('queryRaw', () => {
    it('delegates to repository and returns rows without calling LLM', async () => {
      const rows = [{ location: 'New York', count: 10 }];
      mockRepo.execute.mockResolvedValueOnce(rows);

      const result = await service.queryRaw('count_by_location', []);

      expect(mockRepo.execute).toHaveBeenCalledWith('count_by_location', []);
      expect(mockLlm.complete).not.toHaveBeenCalled();
      expect(result).toEqual(rows);
    });
  });

  describe('execute', () => {
    it('calls repository then LLM to generate summary', async () => {
      const rows = [{ location: 'Austin', count: 5 }];
      mockRepo.execute.mockResolvedValueOnce(rows);
      mockLlm.complete.mockResolvedValueOnce('There are 5 jobs in Austin.');

      const result = await service.execute(
        'count_by_location',
        [],
        'jobs by location',
      );

      expect(mockRepo.execute).toHaveBeenCalledWith('count_by_location', []);
      expect(mockLlm.complete).toHaveBeenCalledTimes(1);
      expect(result.rows).toEqual(rows);
      expect(result.summary).toBe('There are 5 jobs in Austin.');
      expect(result.intent).toBe('count_by_location');
    });

    it('returns early with no-data summary when rows are empty, skipping LLM', async () => {
      mockRepo.execute.mockResolvedValueOnce([]);

      const result = await service.execute(
        'count_by_location',
        [],
        'jobs by location',
      );

      expect(mockLlm.complete).not.toHaveBeenCalled();
      expect(result.rows).toEqual([]);
      expect(result.summary).toBe('No data found for this query.');
    });

    it('passes original query and serialized rows to LLM prompt', async () => {
      const rows = [{ jobType: 'full_time', count: 20 }];
      mockRepo.execute.mockResolvedValueOnce(rows);
      mockLlm.complete.mockResolvedValueOnce('20 full-time jobs found.');

      await service.execute(
        'count_by_job_type',
        [],
        'what job types are there',
      );

      const promptArg = (mockLlm.complete.mock.calls[0] as [string])[0];
      expect(promptArg).toContain('what job types are there');
      expect(promptArg).toContain(JSON.stringify(rows, null, 2));
    });

    it('passes params to repository', async () => {
      mockRepo.execute.mockResolvedValueOnce([{ title: 'Nurse' }]);
      mockLlm.complete.mockResolvedValueOnce('Found nurse roles.');

      await service.execute(
        'list_distinct_titles',
        ['%nurse%'],
        'types of nurse jobs',
      );

      expect(mockRepo.execute).toHaveBeenCalledWith('list_distinct_titles', [
        '%nurse%',
      ]);
    });
  });
});
