import { Test, TestingModule } from '@nestjs/testing';
import { RagService } from '../../../src/rag/rag.service.js';
import { EmbeddingService } from '../../../src/embedding/embedding.service.js';
import { VectorRepository } from '../../../src/storage/vector.repository.js';
import { JobRepository } from '../../../src/storage/job.repository.js';
import { LlmService } from '../../../src/llm/llm.service.js';
import { ResumeService } from '../../../src/resume/resume.service.js';

const mockEmbedding = { embedQuery: jest.fn(), embed: jest.fn(), modelName: 'test-model', provider: 'openai' };
const mockVector = { findSimilar: jest.fn(), findSimilarByJobIds: jest.fn() };
const mockJobRepo = { findByIds: jest.fn() };
const mockLlm = {
  complete: jest.fn(),
  completeStream: jest.fn(),
  completeChat: jest.fn(),
  completeChatStream: jest.fn(),
};
const mockResume = { getParsedData: jest.fn() };

async function buildModule(): Promise<RagService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      RagService,
      { provide: EmbeddingService, useValue: mockEmbedding },
      { provide: VectorRepository, useValue: mockVector },
      { provide: JobRepository, useValue: mockJobRepo },
      { provide: LlmService, useValue: mockLlm },
      { provide: ResumeService, useValue: mockResume },
    ],
  }).compile();
  return module.get(RagService);
}

const SAMPLE_CHUNK = {
  jobId: 'job-1',
  chunkText: 'We need a TypeScript engineer.',
  chunkType: 'description',
  similarity: 0.85,
};

const SAMPLE_JOB = {
  id: 'job-1',
  title: 'Engineer',
  company: 'Acme',
  url: 'http://example.com',
  location: 'Austin',
  jobType: 'full_time',
  minSalary: null,
  maxSalary: null,
  description: 'Full job description.',
  requirements: [],
  responsibilities: [],
  benefits: [],
  skills: [],
};

describe('RagService', () => {
  let service: RagService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockResume.getParsedData.mockResolvedValue(null);
    service = await buildModule();
  });

  describe('query', () => {
    it('returns no-results message when buildContext yields null', async () => {
      mockEmbedding.embedQuery.mockResolvedValueOnce([0.1, 0.2]);
      mockVector.findSimilar.mockResolvedValueOnce([]);

      const result = await service.query('find a job');

      expect(result.answer).toContain('No relevant job postings found');
      expect(result.sources).toHaveLength(0);
      expect(mockLlm.completeChat).not.toHaveBeenCalled();
    });

    it('calls LLM once and returns answer + sources on success', async () => {
      mockEmbedding.embedQuery.mockResolvedValueOnce([0.1, 0.2]);
      mockVector.findSimilar.mockResolvedValueOnce([SAMPLE_CHUNK]);
      mockJobRepo.findByIds.mockResolvedValueOnce([SAMPLE_JOB]);
      mockLlm.completeChat.mockResolvedValueOnce('Here are some jobs.');

      const result = await service.query('find a job');

      expect(mockLlm.completeChat).toHaveBeenCalledTimes(1);
      expect(result.answer).toBe('Here are some jobs.');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].jobId).toBe('job-1');
    });

    it('passes conversation history and the query as the final message', async () => {
      mockEmbedding.embedQuery.mockResolvedValueOnce([0.1, 0.2]);
      mockVector.findSimilar.mockResolvedValueOnce([SAMPLE_CHUNK]);
      mockJobRepo.findByIds.mockResolvedValueOnce([SAMPLE_JOB]);
      mockLlm.completeChat.mockResolvedValueOnce('Job 1 is a great fit.');

      const history = [
        { role: 'user' as const, content: 'recommend me jobs' },
        { role: 'assistant' as const, content: 'Here are some jobs.' },
      ];
      await service.query(
        'why is job 1 good?',
        undefined,
        undefined,
        undefined,
        history,
      );

      const messages = mockLlm.completeChat.mock.calls[0][0];
      expect(messages[0].role).toBe('system');
      expect(messages.slice(1, 3)).toEqual(history);
      expect(messages[messages.length - 1]).toEqual({
        role: 'user',
        content: 'why is job 1 good?',
      });
    });
  });

  describe('buildContext', () => {
    it('returns null when vector repo returns no chunks', async () => {
      mockEmbedding.embedQuery.mockResolvedValueOnce([0.1, 0.2]);
      mockVector.findSimilar.mockResolvedValueOnce([]);

      const ctx = await service.buildContext('python jobs');

      expect(ctx).toBeNull();
    });

    it('returns context with systemMessage, sources, and contextChunks', async () => {
      mockEmbedding.embedQuery.mockResolvedValueOnce([0.1, 0.2]);
      mockVector.findSimilar.mockResolvedValueOnce([SAMPLE_CHUNK]);
      mockJobRepo.findByIds.mockResolvedValueOnce([SAMPLE_JOB]);

      const ctx = await service.buildContext('python jobs');

      expect(ctx).not.toBeNull();
      expect(ctx!.systemMessage).toContain('Engineer at Acme');
      expect(ctx!.sources).toHaveLength(1);
      expect(ctx!.contextChunks).toContain('Engineer at Acme');
    });

    it('includes job header with similarity score in contextChunks', async () => {
      mockEmbedding.embedQuery.mockResolvedValueOnce([0.1, 0.2]);
      mockVector.findSimilar.mockResolvedValueOnce([SAMPLE_CHUNK]);
      mockJobRepo.findByIds.mockResolvedValueOnce([SAMPLE_JOB]);

      const ctx = await service.buildContext('any query');

      expect(ctx!.contextChunks).toContain('Similarity: 0.85');
    });

    it('skips embedding when contextJobIds are provided', async () => {
      mockVector.findSimilarByJobIds.mockResolvedValueOnce([SAMPLE_CHUNK]);
      mockJobRepo.findByIds.mockResolvedValueOnce([SAMPLE_JOB]);
      mockEmbedding.embedQuery.mockResolvedValueOnce([0.1]);

      await service.buildContext('query', undefined, ['job-1']);

      expect(mockVector.findSimilar).not.toHaveBeenCalled();
      expect(mockVector.findSimilarByJobIds).toHaveBeenCalled();
    });
  });

  describe('groupByJob (via buildContext)', () => {
    it('deduplicates multiple chunks for the same job', async () => {
      const chunk2 = { ...SAMPLE_CHUNK, chunkType: 'requirements', similarity: 0.75 };
      mockEmbedding.embedQuery.mockResolvedValueOnce([0.1]);
      mockVector.findSimilar.mockResolvedValueOnce([SAMPLE_CHUNK, chunk2]);
      mockJobRepo.findByIds.mockResolvedValueOnce([SAMPLE_JOB]);

      const ctx = await service.buildContext('any query');

      expect(ctx!.sources).toHaveLength(1);
      expect(ctx!.sources[0].similarity).toBe(0.85);
    });

    it('ranks jobs by highest chunk similarity', async () => {
      const job2 = { ...SAMPLE_JOB, id: 'job-2', title: 'Designer', company: 'Beta' };
      const chunk2 = { jobId: 'job-2', chunkText: 'Design work.', chunkType: 'description', similarity: 0.95 };
      mockEmbedding.embedQuery.mockResolvedValueOnce([0.1]);
      mockVector.findSimilar.mockResolvedValueOnce([SAMPLE_CHUNK, chunk2]);
      mockJobRepo.findByIds.mockResolvedValueOnce([SAMPLE_JOB, job2]);

      const ctx = await service.buildContext('any query');

      expect(ctx!.sources[0].jobId).toBe('job-2');
      expect(ctx!.sources[1].jobId).toBe('job-1');
    });
  });
});
