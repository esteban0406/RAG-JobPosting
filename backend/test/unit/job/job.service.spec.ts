import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JobService } from '../../../src/job/job.service.js';
import { JobRepository } from '../../../src/storage/job.repository.js';

const mockRepo = {
  findById: jest.fn(),
  findAll: jest.fn(),
  count: jest.fn(),
  createJob: jest.fn(),
  updateJob: jest.fn(),
  deleteJob: jest.fn(),
};

async function buildModule(): Promise<JobService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      JobService,
      { provide: JobRepository, useValue: mockRepo },
    ],
  }).compile();
  return module.get(JobService);
}

const SAMPLE_JOB = {
  id: 'job-1',
  title: 'Engineer',
  company: 'Acme',
  description: 'Some description',
  url: 'http://example.com',
  location: 'Austin',
  jobType: 'full_time',
  minSalary: null,
  maxSalary: null,
  createdAt: new Date(),
};

describe('JobService', () => {
  let service: JobService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildModule();
  });

  describe('getById', () => {
    it('throws NotFoundException when job does not exist', async () => {
      mockRepo.findById.mockResolvedValueOnce(null);

      await expect(service.getById('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the job when found', async () => {
      mockRepo.findById.mockResolvedValueOnce(SAMPLE_JOB);

      const result = await service.getById('job-1');

      expect(result).toEqual(SAMPLE_JOB);
    });
  });

  describe('list', () => {
    it('returns paginated shape with defaults', async () => {
      mockRepo.findAll.mockResolvedValueOnce([SAMPLE_JOB]);
      mockRepo.count.mockResolvedValueOnce(1);

      const result = await service.list({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(1);
      expect(result.jobs).toEqual([SAMPLE_JOB]);
    });

    it('respects page and limit from filters', async () => {
      mockRepo.findAll.mockResolvedValueOnce([]);
      mockRepo.count.mockResolvedValueOnce(0);

      const result = await service.list({ page: 3, limit: 5 });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(5);
    });

    it('calls findAll and count in parallel', async () => {
      mockRepo.findAll.mockResolvedValueOnce([SAMPLE_JOB]);
      mockRepo.count.mockResolvedValueOnce(10);

      await service.list({ location: 'Austin' });

      expect(mockRepo.findAll).toHaveBeenCalledWith({ location: 'Austin' });
      expect(mockRepo.count).toHaveBeenCalledWith({ location: 'Austin' });
    });
  });

  describe('create', () => {
    it('generates a deterministic contentHash from job fields', async () => {
      mockRepo.createJob.mockResolvedValueOnce(SAMPLE_JOB);

      await service.create({
        title: 'Engineer',
        company: 'Acme',
        description: 'Some description',
        url: 'http://example.com',
        location: 'Austin',
      });

      const call = mockRepo.createJob.mock.calls[0][0] as Record<string, unknown>;
      expect(typeof call.contentHash).toBe('string');
      expect((call.contentHash as string).length).toBe(64);
    });

    it('sets source=manual and uses first 16 chars of hash as sourceId', async () => {
      mockRepo.createJob.mockResolvedValueOnce(SAMPLE_JOB);

      await service.create({
        title: 'Engineer',
        company: 'Acme',
        description: 'Some description',
        url: 'http://example.com',
      });

      const call = mockRepo.createJob.mock.calls[0][0] as Record<string, unknown>;
      expect(call.source).toBe('manual');
      expect((call.sourceId as string).length).toBe(16);
    });

    it('produces the same hash for the same input', async () => {
      mockRepo.createJob.mockResolvedValue(SAMPLE_JOB);

      await service.create({
        title: 'X',
        company: 'Y',
        description: 'Z',
        url: 'http://x.com',
      });
      const hash1 = (mockRepo.createJob.mock.calls[0][0] as Record<string, unknown>).contentHash;

      mockRepo.createJob.mockClear();

      await service.create({
        title: 'X',
        company: 'Y',
        description: 'Z',
        url: 'http://x.com',
      });
      const hash2 = (mockRepo.createJob.mock.calls[0][0] as Record<string, unknown>).contentHash;

      expect(hash1).toBe(hash2);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when job does not exist', async () => {
      mockRepo.findById.mockResolvedValueOnce(null);

      await expect(service.update('missing-id', { title: 'New' })).rejects.toThrow(
        NotFoundException,
      );

      expect(mockRepo.updateJob).not.toHaveBeenCalled();
    });

    it('delegates to repo.updateJob after guard passes', async () => {
      mockRepo.findById.mockResolvedValueOnce(SAMPLE_JOB);
      mockRepo.updateJob.mockResolvedValueOnce({ ...SAMPLE_JOB, title: 'New' });

      const result = await service.update('job-1', { title: 'New' });

      expect(mockRepo.updateJob).toHaveBeenCalledWith('job-1', { title: 'New' });
      expect(result.title).toBe('New');
    });
  });

  describe('delete', () => {
    it('throws NotFoundException when job does not exist', async () => {
      mockRepo.findById.mockResolvedValueOnce(null);

      await expect(service.delete('missing-id')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockRepo.deleteJob).not.toHaveBeenCalled();
    });

    it('calls repo.deleteJob after guard passes', async () => {
      mockRepo.findById.mockResolvedValueOnce(SAMPLE_JOB);
      mockRepo.deleteJob.mockResolvedValueOnce(undefined);

      await service.delete('job-1');

      expect(mockRepo.deleteJob).toHaveBeenCalledWith('job-1');
    });
  });
});
