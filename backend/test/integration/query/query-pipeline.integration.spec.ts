import { ConfigService } from '@nestjs/config';
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
import { VECTOR_STORE } from '../../../src/storage/vector-store/vector-store.interface.js';
import { JobRepository } from '../../../src/storage/job.repository.js';
import { AggregationRepository } from '../../../src/query/aggregation/aggregation.repository.js';
import { ResumeService } from '../../../src/resume/resume.service.js';
import { Bm25IndexService } from '../../../src/retrieval/bm25-index.service.js';
import { RerankService } from '../../../src/retrieval/rerank.service.js';
import { RetrievalPipeline } from '../../../src/retrieval/retrieval-pipeline.service.js';
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
  search: jest.fn(),
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
  findAllUnpaged: jest.fn(),
};
const mockAggRepo = { execute: jest.fn() };
const mockResumeService = { getParsedData: jest.fn() };
const mockRerank = { score: jest.fn() };
const config = {
  get: (key: string, fallback?: unknown) =>
    ({ RETRIEVAL_HYBRID: 'true', RERANK_ENABLED: 'true' })[key] ?? fallback,
};

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
      { provide: VECTOR_STORE, useValue: mockVectorRepo },
      { provide: JobRepository, useValue: mockJobRepo },
      { provide: AggregationRepository, useValue: mockAggRepo },
      { provide: ResumeService, useValue: mockResumeService },
      RetrievalPipeline,
      Bm25IndexService,
      { provide: RerankService, useValue: mockRerank },
      { provide: ConfigService, useValue: config },
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
    // Default data for the retrieval pipeline: BM25 indexes JOB_RECORDS,
    // candidates are fetched by id and the reranker keeps the fused order.
    mockJobRepo.findAllUnpaged.mockResolvedValue(JOB_RECORDS);
    mockJobRepo.findByIds.mockImplementation((ids: string[]) =>
      Promise.resolve(JOB_RECORDS.filter((j) => ids.includes(j.id))),
    );
    mockVectorRepo.findSimilarByJobIds.mockImplementation(
      (_v: number[], ids: string[]) =>
        Promise.resolve(CHUNK_RESULTS.filter((c) => ids.includes(c.jobId))),
    );
    mockRerank.score.mockImplementation((_q: string, docs: string[]) =>
      Promise.resolve({
        scores: docs.map((_, i) => 1 - i / 10),
        model: 'test',
      }),
    );
  });

  describe('retrieval flow end-to-end', () => {
    it('routes through Classifier → RagService and returns type=retrieval', async () => {
      mockVectorRepo.search.mockResolvedValueOnce(CHUNK_RESULTS);
      mockJobRepo.findByIds.mockResolvedValueOnce(JOB_RECORDS);
      mockLlm.completeChat.mockResolvedValueOnce(
        'Here are some matching jobs.',
      );

      const result = await orchestrator.handle(
        makeDto('find software engineers'),
      );

      expect(result.type).toBe('retrieval');
      expect(result.answer).toBe('Here are some matching jobs.');
      expect(result.sources).toHaveLength(2);
      expect(result.sources![0].jobId).toBe('job-1');
      expect(mockEmbedding.embedQuery).toHaveBeenCalledTimes(1);
      expect(mockVectorRepo.search).toHaveBeenCalledWith(QUERY_VECTOR, {
        topK: 50,
        filter: undefined,
      });
      expect(mockRerank.score).toHaveBeenCalled();
      expect(mockJobRepo.findByIds).toHaveBeenCalledWith(['job-1', 'job-2']);
      expect(mockLlm.completeChat).toHaveBeenCalledTimes(1);
    });

    it('returns no-results answer when neither dense nor BM25 finds a job', async () => {
      mockVectorRepo.search.mockResolvedValueOnce([]);

      const result = await orchestrator.handle(makeDto('find remote jobs'));

      expect(result.answer).toContain('No relevant job postings found');
      expect(result.sources).toHaveLength(0);
      expect(mockJobRepo.findByIds).not.toHaveBeenCalled();
      expect(mockLlm.completeChat).not.toHaveBeenCalled();
    });

    it('answers from a job only BM25 found (hybrid retrieval)', async () => {
      mockVectorRepo.search.mockResolvedValueOnce([]);
      mockLlm.completeChat.mockResolvedValueOnce('One TypeScript role.');

      const result = await orchestrator.handle(
        makeDto('find typescript roles'),
      );

      expect(result.answer).toBe('One TypeScript role.');
      expect(result.sources?.map((s) => s.jobId)).toEqual(['job-1']);
    });

    it('applies the extracted constraints to dense and BM25 retrieval', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"retrieval","intent":"filter_jobs","filters":{"title":"%engineer%","isRemote":true}}',
      );
      mockVectorRepo.search.mockResolvedValue([]);
      mockLlm.completeChat.mockResolvedValueOnce('No remote match.');

      await orchestrator.handle(makeDto('find remote engineer jobs'));

      // Dense search ran with the filter first; nothing matched (no job in
      // JOB_RECORDS is remote, so BM25 found nothing either) and the search
      // was repeated without it.
      expect(mockVectorRepo.search).toHaveBeenNthCalledWith(1, QUERY_VECTOR, {
        topK: 50,
        filter: { isRemote: true },
      });
      expect(mockVectorRepo.search).toHaveBeenNthCalledWith(2, QUERY_VECTOR, {
        topK: 50,
        filter: undefined,
      });
      const [messages] = mockLlm.completeChat.mock.calls[0] as [
        Array<{ content: string }>,
      ];
      expect(messages[0].content).toContain('closest matches');
    });

    it('skips vector-search embedding and uses findSimilarByJobIds when contextJobIds are provided', async () => {
      mockVectorRepo.findSimilarByJobIds.mockResolvedValueOnce([
        CHUNK_RESULTS[0],
      ]);
      mockJobRepo.findByIds.mockResolvedValueOnce([JOB_RECORDS[0]]);
      mockLlm.completeChat.mockResolvedValueOnce('Context answer.');

      const result = await orchestrator.handle(
        makeDto('find software engineers', {
          contextJobIds: ['job-1'],
        } as Partial<SearchQueryDto>),
      );

      expect(result.type).toBe('retrieval');
      // embedQuery IS called to rank the provided jobs by similarity (buildContextFromIds uses it)
      expect(mockVectorRepo.search).not.toHaveBeenCalled();
      expect(mockVectorRepo.findSimilarByJobIds).toHaveBeenCalled();
    });

    it('uses resume-augmented embedding when userId resolves a resume', async () => {
      mockResumeService.getParsedData.mockResolvedValueOnce({
        name: 'Alice',
        skills: ['TypeScript', 'React'],
        experience: [
          {
            title: 'Engineer',
            company: 'Acme',
            startDate: '2020',
            endDate: null,
          },
        ],
        location: 'NYC',
        summary: null,
      });
      mockVectorRepo.search.mockResolvedValueOnce(CHUNK_RESULTS);
      mockJobRepo.findByIds.mockResolvedValueOnce(JOB_RECORDS);
      mockLlm.completeChat.mockResolvedValueOnce('Resume-aware answer.');

      await orchestrator.handle(makeDto('find software engineers'), 'user-123');

      expect(mockResumeService.getParsedData).toHaveBeenCalledWith('user-123');
      expect(mockEmbedding.embedQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('aggregation flow end-to-end', () => {
    it('routes through Classifier → AggregationService and returns type=aggregation', async () => {
      // The regex flags aggregation; the LLM picks the SQL template.
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"aggregation","intent":"count_by_location","params":[]}',
      );
      mockAggRepo.execute.mockResolvedValueOnce(AGG_ROWS);
      mockLlm.complete.mockResolvedValueOnce('There are 5 jobs in NYC.');

      const result = await orchestrator.handle(
        makeDto('how many jobs by location'),
      );

      expect(result.type).toBe('aggregation');
      expect(result.answer).toBe('There are 5 jobs in NYC.');
      expect(mockEmbedding.embedQuery).not.toHaveBeenCalled();
      expect(mockVectorRepo.search).not.toHaveBeenCalled();
      expect(mockAggRepo.execute).toHaveBeenCalledWith('count_by_location', []);
      expect(mockLlm.complete).toHaveBeenCalledTimes(2);
    });

    it('returns "No data found" when aggregation rows are empty', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"aggregation","intent":"count_remote","params":[]}',
      );
      mockAggRepo.execute.mockResolvedValueOnce([]);

      const result = await orchestrator.handle(
        makeDto('how many remote jobs exist'),
      );

      expect(result.answer).toBe('No data found for this query.');
      expect(mockLlm.complete).toHaveBeenCalledTimes(1);
    });

    it('falls back to retrieval when no aggregation template is chosen', async () => {
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"aggregation","intent":null,"params":[]}',
      );
      mockVectorRepo.search.mockResolvedValueOnce(CHUNK_RESULTS);
      mockJobRepo.findByIds.mockResolvedValueOnce(JOB_RECORDS);
      mockLlm.completeChat.mockResolvedValueOnce(
        'Salary details for these jobs.',
      );

      const result = await orchestrator.handle(
        makeDto('what is the salary for these roles'),
      );

      expect(result.type).toBe('retrieval');
      expect(mockAggRepo.execute).not.toHaveBeenCalled();
    });
  });

  describe('hybrid flow end-to-end', () => {
    it('calls both pipelines and combines with LLM', async () => {
      // This query matches both AGGREGATION_PATTERN and RETRIEVAL_PATTERN → triggers classifyWithLlm
      mockLlm.complete.mockResolvedValueOnce(
        '{"type":"hybrid","intent":"count_by_location","params":[]}',
      );
      mockLlm.completeChat.mockResolvedValueOnce('Combined hybrid answer.');

      mockVectorRepo.search.mockResolvedValueOnce([CHUNK_RESULTS[0]]);
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
        .mockResolvedValueOnce(
          '{"type":"hybrid","intent":"count_by_location","params":[]}',
        )
        .mockResolvedValueOnce('Aggregation fallback.');

      mockVectorRepo.search.mockRejectedValueOnce(new Error('pgvector down'));
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

      mockVectorRepo.search.mockResolvedValueOnce([CHUNK_RESULTS[0]]);
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
