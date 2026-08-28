import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../generated/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  })),
}));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));

import { QueryOrchestratorService } from '../../../src/query/query-orchestrator.service.js';
import { QueryClassifierService } from '../../../src/query/query-classifier.service.js';
import { RagService } from '../../../src/rag/rag.service.js';
import { AggregationService } from '../../../src/query/aggregation/aggregation.service.js';
import { LlmService } from '../../../src/llm/llm.service.js';
import { EmbeddingService } from '../../../src/embedding/embedding.service.js';
import { VectorRepository } from '../../../src/storage/vector.repository.js';
import { JobRepository } from '../../../src/storage/job.repository.js';
import { AggregationRepository } from '../../../src/query/aggregation/aggregation.repository.js';
import { ResumeService } from '../../../src/resume/resume.service.js';
import { SearchQueryDto } from '../../../src/query/dto/search-query.dto.js';

const mockLlm = {
  complete: jest.fn(),
  completeStream: jest.fn(),
  completeChat: jest.fn(),
  completeChatStream: jest.fn(),
};
const mockEmbedding = {
  embedQuery: jest.fn(),
  embed: jest.fn(),
  modelName: 'test-model',
  provider: 'local',
};
const mockVectorRepo = {
  findSimilar: jest.fn(),
  findSimilarByJobIds: jest.fn(),
  findSimilarWithJob: jest.fn(),
  hasEmbedding: jest.fn(),
  upsertChunks: jest.fn(),
};
const mockJobRepo = {
  findByIds: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  count: jest.fn(),
  createJob: jest.fn(),
  updateJob: jest.fn(),
  deleteJob: jest.fn(),
  upsertJob: jest.fn(),
  findByContentHash: jest.fn(),
};
const mockAggRepo = { execute: jest.fn() };
const mockResumeService = { getParsedData: jest.fn() };

const QUERY_VECTOR = [0.1, 0.2, 0.3];

const CHUNK_RESULTS = [
  {
    id: 'chunk-1',
    jobId: 'job-1',
    chunkType: 'summary',
    chunkText: 'TypeScript engineer role',
    embeddingModel: 'test-model',
    similarity: 0.9,
  },
  {
    id: 'chunk-2',
    jobId: 'job-2',
    chunkType: 'summary',
    chunkText: 'Manager role',
    embeddingModel: 'test-model',
    similarity: 0.8,
  },
];

const JOB_RECORDS = [
  {
    id: 'job-1',
    title: 'Software Engineer',
    company: 'Acme',
    location: 'NYC',
    description: 'Great TypeScript role.',
    url: 'http://example.com/1',
    jobType: 'full_time',
    isRemote: false,
    minSalary: null,
    maxSalary: null,
    requirements: [],
    responsibilities: [],
    benefits: [],
    skills: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    fetchedAt: new Date(),
    contentHash: 'abc',
    source: 'manual',
    sourceId: '1',
    summary: null,
    salary: null,
    logo: null,
  },
  {
    id: 'job-2',
    title: 'Engineering Manager',
    company: 'Beta',
    location: 'SF',
    description: 'Lead a team.',
    url: 'http://example.com/2',
    jobType: 'full_time',
    isRemote: false,
    minSalary: null,
    maxSalary: null,
    requirements: [],
    responsibilities: [],
    benefits: [],
    skills: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    fetchedAt: new Date(),
    contentHash: 'def',
    source: 'manual',
    sourceId: '2',
    summary: null,
    salary: null,
    logo: null,
  },
];

const AGG_ROWS = [{ location: 'NYC', count: 5 }];

function makeDto(
  query = 'find software engineers',
  overrides: Partial<SearchQueryDto> = {},
): SearchQueryDto {
  const dto = new SearchQueryDto();
  dto.query = query;
  Object.assign(dto, overrides);
  return dto;
}

async function buildModule(): Promise<QueryOrchestratorService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      QueryOrchestratorService,
      QueryClassifierService,
      RagService,
      AggregationService,
      { provide: LlmService, useValue: mockLlm },
      { provide: EmbeddingService, useValue: mockEmbedding },
      { provide: VectorRepository, useValue: mockVectorRepo },
      { provide: JobRepository, useValue: mockJobRepo },
      { provide: AggregationRepository, useValue: mockAggRepo },
      { provide: ResumeService, useValue: mockResumeService },
    ],
  }).compile();
  return module.get(QueryOrchestratorService);
}

describe('Query Pipeline Integration', () => {
  let orchestrator: QueryOrchestratorService;

  beforeAll(async () => {
    orchestrator = await buildModule();
  });

  beforeEach(() => {
    // resetAllMocks clears both call counts AND the mockResolvedValueOnce queue,
    // preventing leftover mock values from bleeding between tests.
    jest.resetAllMocks();
    mockEmbedding.embedQuery.mockResolvedValue(QUERY_VECTOR);
    mockResumeService.getParsedData.mockResolvedValue(null);
  });

  describe('retrieval flow end-to-end', () => {
    it('routes through Classifier → RagService and returns type=retrieval', async () => {
      mockVectorRepo.findSimilar.mockResolvedValueOnce(CHUNK_RESULTS);
      mockJobRepo.findByIds.mockResolvedValueOnce(JOB_RECORDS);
      mockLlm.completeChat.mockResolvedValueOnce('Here are some matching jobs.');

      const result = await orchestrator.handle(makeDto('find software engineers'));

      expect(result.type).toBe('retrieval');
      expect(result.answer).toBe('Here are some matching jobs.');
      expect(result.sources).toHaveLength(2);
      expect(result.sources![0].jobId).toBe('job-1');
      expect(mockEmbedding.embedQuery).toHaveBeenCalledTimes(1);
      expect(mockVectorRepo.findSimilar).toHaveBeenCalledWith(QUERY_VECTOR, 15, 0.5);
      expect(mockJobRepo.findByIds).toHaveBeenCalledWith(['job-1', 'job-2']);
      expect(mockLlm.completeChat).toHaveBeenCalledTimes(1);
    });

    it('returns no-results answer when vector search returns empty', async () => {
      mockVectorRepo.findSimilar.mockResolvedValueOnce([]);

      const result = await orchestrator.handle(makeDto('find remote jobs'));

      expect(result.answer).toContain('No relevant job postings found');
      expect(result.sources).toHaveLength(0);
      expect(mockJobRepo.findByIds).not.toHaveBeenCalled();
      expect(mockLlm.completeChat).not.toHaveBeenCalled();
    });

    it('skips vector-search embedding and uses findSimilarByJobIds when contextJobIds are provided', async () => {
      mockVectorRepo.findSimilarByJobIds.mockResolvedValueOnce([CHUNK_RESULTS[0]]);
      mockJobRepo.findByIds.mockResolvedValueOnce([JOB_RECORDS[0]]);
      mockLlm.completeChat.mockResolvedValueOnce('Context answer.');

      const result = await orchestrator.handle(
        makeDto('find software engineers', { contextJobIds: ['job-1'] } as Partial<SearchQueryDto>),
      );

      expect(result.type).toBe('retrieval');
      // embedQuery IS called to rank the provided jobs by similarity (buildContextFromIds uses it)
      expect(mockVectorRepo.findSimilar).not.toHaveBeenCalled();
      expect(mockVectorRepo.findSimilarByJobIds).toHaveBeenCalled();
    });

    it('uses resume-augmented embedding when userId resolves a resume', async () => {
      mockResumeService.getParsedData.mockResolvedValueOnce({
        name: 'Alice',
        skills: ['TypeScript', 'React'],
        experience: [{ title: 'Engineer', company: 'Acme', startDate: '2020', endDate: null }],
        location: 'NYC',
        summary: null,
      });
      mockVectorRepo.findSimilar.mockResolvedValueOnce(CHUNK_RESULTS);
      mockJobRepo.findByIds.mockResolvedValueOnce(JOB_RECORDS);
      mockLlm.completeChat.mockResolvedValueOnce('Resume-aware answer.');

      await orchestrator.handle(makeDto('find software engineers'), 'user-123');

      expect(mockResumeService.getParsedData).toHaveBeenCalledWith('user-123');
      expect(mockEmbedding.embedQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('aggregation flow end-to-end', () => {
    it('routes through Classifier → AggregationService and returns type=aggregation', async () => {
      mockAggRepo.execute.mockResolvedValueOnce(AGG_ROWS);
      mockLlm.complete.mockResolvedValueOnce('There are 5 jobs in NYC.');

      const result = await orchestrator.handle(makeDto('how many jobs by location'));

      expect(result.type).toBe('aggregation');
      expect(result.answer).toBe('There are 5 jobs in NYC.');
      expect(mockEmbedding.embedQuery).not.toHaveBeenCalled();
      expect(mockVectorRepo.findSimilar).not.toHaveBeenCalled();
      expect(mockAggRepo.execute).toHaveBeenCalledTimes(1);
      expect(mockLlm.complete).toHaveBeenCalledTimes(1);
    });

    it('returns "No data found" when aggregation rows are empty', async () => {
      mockAggRepo.execute.mockResolvedValueOnce([]);

      const result = await orchestrator.handle(makeDto('how many remote jobs exist'));

      expect(result.answer).toBe('No data found for this query.');
      expect(mockLlm.complete).not.toHaveBeenCalled();
    });
  });

  describe('hybrid flow end-to-end', () => {
    it('calls both pipelines and combines with LLM', async () => {
      // This query matches both AGGREGATION_PATTERN and RETRIEVAL_PATTERN → triggers classifyWithLlm
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"hybrid","intent":"count_by_location","params":[]}',
      );
      mockLlm.completeChat.mockResolvedValueOnce('Combined hybrid answer.');

      mockVectorRepo.findSimilar.mockResolvedValueOnce([CHUNK_RESULTS[0]]);
      mockJobRepo.findByIds.mockResolvedValueOnce([JOB_RECORDS[0]]);
      mockAggRepo.execute.mockResolvedValueOnce(AGG_ROWS);

      const result = await orchestrator.handle(
        makeDto('find senior engineers and how many jobs are available'),
      );

      expect(result.type).toBe('hybrid');
      expect(result.answer).toBe('Combined hybrid answer.');
      expect(result.sources).toHaveLength(1);
      expect(mockLlm.complete).toHaveBeenCalledTimes(1);
      expect(mockLlm.completeChat).toHaveBeenCalledTimes(1);
    });
  });

  describe('graceful degradation', () => {
    it('falls back to aggregation-only when VectorRepository rejects during hybrid', async () => {
      mockLlm.complete
        .mockResolvedValueOnce('{"type":"hybrid","intent":"count_by_location","params":[]}')
        .mockResolvedValueOnce('Aggregation fallback.');

      mockVectorRepo.findSimilar.mockRejectedValueOnce(new Error('pgvector down'));
      // execute is called twice: once from queryRaw (allSettled parallel) and once
      // from the fallback aggregation.execute() call — use permanent mock to cover both
      mockAggRepo.execute.mockResolvedValue(AGG_ROWS);

      const result = await orchestrator.handle(
        makeDto('find senior engineers and how many jobs are available'),
      );

      expect(result.type).toBe('aggregation');
      expect((result as { sources?: unknown }).sources).toBeUndefined();
    });

    it('falls back to retrieval-only when AggregationRepository rejects during hybrid', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"hybrid","intent":"count_by_location","params":[]}',
      );
      mockLlm.completeChat.mockResolvedValueOnce('Retrieval fallback answer.');

      mockVectorRepo.findSimilar.mockResolvedValueOnce([CHUNK_RESULTS[0]]);
      mockJobRepo.findByIds.mockResolvedValueOnce([JOB_RECORDS[0]]);
      mockAggRepo.execute.mockRejectedValueOnce(new Error('DB timeout'));

      const result = await orchestrator.handle(
        makeDto('find senior engineers and how many jobs are available'),
      );

      expect(result.type).toBe('retrieval');
      expect(result.answer).toBe('Retrieval fallback answer.');
    });
  });
});
