import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JobService } from '../../../src/job/job.service.js';
import { JobRepository } from '../../../src/storage/job.repository.js';
import { PrismaService } from '../../../src/storage/prisma.service.js';

const mockPrisma = {
  job: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
  },
};

const JOB = {
  id: 'job-1',
  title: 'Software Engineer',
  company: 'Acme Corp',
  description: 'Great role for engineers.',
  url: 'https://example.com/jobs/1',
  location: 'Austin, TX',
  jobType: 'full_time',
  isRemote: false,
  minSalary: 120000,
  maxSalary: 160000,
  contentHash: 'abc123def456abc1',
  source: 'manual',
  sourceId: 'abc123def456abc1',
  fetchedAt: new Date('2024-01-01'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  skills: [],
  requirements: [],
  responsibilities: [],
  benefits: [],
  summary: null,
  salary: null,
  logo: null,
};

async function buildModule(): Promise<{ job: JobService }> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      JobService,
      JobRepository,
      { provide: PrismaService, useValue: mockPrisma },
    ],
  }).compile();
  return { job: module.get(JobService) };
}

describe('Job CRUD Integration', () => {
  let job: JobService;

  beforeAll(async () => {
    ({ job } = await buildModule());
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list — exercises JobRepository.buildWhere', () => {
    it('returns paginated shape with default page=1 limit=20', async () => {
      mockPrisma.job.findMany.mockResolvedValueOnce([JOB]);
      mockPrisma.job.count.mockResolvedValueOnce(1);

      const result = await job.list({});

      expect(result.jobs).toEqual([JOB]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockPrisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('keyword filter builds OR on title/company with insensitive contains', async () => {
      mockPrisma.job.findMany.mockResolvedValueOnce([]);
      mockPrisma.job.count.mockResolvedValueOnce(0);

      await job.list({ keyword: 'engineer' });

      const { where } = mockPrisma.job.findMany.mock.calls[0][0] as {
        where: { OR?: unknown[] };
      };
      expect(where.OR).toEqual([
        { title: { contains: 'engineer', mode: 'insensitive' } },
        { company: { contains: 'engineer', mode: 'insensitive' } },
      ]);
    });

    it('location filter uses insensitive contains', async () => {
      mockPrisma.job.findMany.mockResolvedValueOnce([]);
      mockPrisma.job.count.mockResolvedValueOnce(0);

      await job.list({ location: 'Austin' });

      const { where } = mockPrisma.job.findMany.mock.calls[0][0] as {
        where: { location?: unknown };
      };
      expect(where.location).toEqual({ contains: 'Austin', mode: 'insensitive' });
    });

    it('minSalary filter maps to maxSalary gte (salary inversion in buildWhere)', async () => {
      mockPrisma.job.findMany.mockResolvedValueOnce([]);
      mockPrisma.job.count.mockResolvedValueOnce(0);

      await job.list({ minSalary: 100000 });

      const { where } = mockPrisma.job.findMany.mock.calls[0][0] as {
        where: { maxSalary?: unknown; minSalary?: unknown };
      };
      expect(where.maxSalary).toEqual({ gte: 100000 });
      expect(where.minSalary).toBeUndefined();
    });

    it('maxSalary filter maps to minSalary lte (salary inversion in buildWhere)', async () => {
      mockPrisma.job.findMany.mockResolvedValueOnce([]);
      mockPrisma.job.count.mockResolvedValueOnce(0);

      await job.list({ maxSalary: 150000 });

      const { where } = mockPrisma.job.findMany.mock.calls[0][0] as {
        where: { minSalary?: unknown; maxSalary?: unknown };
      };
      expect(where.minSalary).toEqual({ lte: 150000 });
      expect(where.maxSalary).toBeUndefined();
    });

    it('applies correct skip and take for page 2 limit 10', async () => {
      mockPrisma.job.findMany.mockResolvedValueOnce([]);
      mockPrisma.job.count.mockResolvedValueOnce(0);

      await job.list({ page: 2, limit: 10 });

      expect(mockPrisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  describe('getById', () => {
    it('returns the job when it exists', async () => {
      mockPrisma.job.findUnique.mockResolvedValueOnce(JOB);

      const result = await job.getById('job-1');

      expect(result.id).toBe('job-1');
      expect(mockPrisma.job.findUnique).toHaveBeenCalledWith({ where: { id: 'job-1' } });
    });

    it('throws NotFoundException through the full chain when job does not exist', async () => {
      mockPrisma.job.findUnique.mockResolvedValueOnce(null);

      await expect(job.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create — deterministic SHA-256 contentHash', () => {
    const CREATE_DTO = {
      title: 'Software Engineer',
      company: 'Acme Corp',
      description: 'Great role for engineers.',
      url: 'https://example.com/jobs/1',
      location: 'Austin, TX',
    };

    it('generates a 64-char contentHash and 16-char sourceId with source=manual', async () => {
      mockPrisma.job.create.mockResolvedValueOnce(JOB);

      await job.create(CREATE_DTO);

      const data = (mockPrisma.job.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
      expect(typeof data.contentHash).toBe('string');
      expect((data.contentHash as string).length).toBe(64);
      expect((data.sourceId as string).length).toBe(16);
      expect(data.source).toBe('manual');
    });

    it('produces the same hash for identical inputs', async () => {
      mockPrisma.job.create.mockResolvedValue(JOB);

      await job.create(CREATE_DTO);
      const hash1 = (mockPrisma.job.create.mock.calls[0][0] as { data: Record<string, unknown> }).data.contentHash;

      await job.create(CREATE_DTO);
      const hash2 = (mockPrisma.job.create.mock.calls[1][0] as { data: Record<string, unknown> }).data.contentHash;

      expect(hash1).toBe(hash2);
    });

    it('produces a different hash when description changes', async () => {
      mockPrisma.job.create.mockResolvedValue(JOB);

      await job.create({ ...CREATE_DTO, description: 'Original description.' });
      const hash1 = (mockPrisma.job.create.mock.calls[0][0] as { data: Record<string, unknown> }).data.contentHash;

      await job.create({ ...CREATE_DTO, description: 'Completely different.' });
      const hash2 = (mockPrisma.job.create.mock.calls[1][0] as { data: Record<string, unknown> }).data.contentHash;

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('update — guard via getById', () => {
    it('updates the job when it exists', async () => {
      mockPrisma.job.findUnique.mockResolvedValueOnce(JOB);
      mockPrisma.job.update.mockResolvedValueOnce({ ...JOB, title: 'Updated Title' });

      const result = await job.update('job-1', { title: 'Updated Title' });

      expect(result.title).toBe('Updated Title');
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { title: 'Updated Title' },
      });
    });

    it('throws NotFoundException and does NOT call update when job does not exist', async () => {
      mockPrisma.job.findUnique.mockResolvedValueOnce(null);

      await expect(job.update('nonexistent', { title: 'X' })).rejects.toThrow(NotFoundException);
      expect(mockPrisma.job.update).not.toHaveBeenCalled();
    });
  });

  describe('delete — guard via getById', () => {
    it('deletes the job when it exists', async () => {
      mockPrisma.job.findUnique.mockResolvedValueOnce(JOB);
      mockPrisma.job.delete.mockResolvedValueOnce(undefined);

      await job.delete('job-1');

      expect(mockPrisma.job.delete).toHaveBeenCalledWith({ where: { id: 'job-1' } });
    });

    it('throws NotFoundException and does NOT call delete when job does not exist', async () => {
      mockPrisma.job.findUnique.mockResolvedValueOnce(null);

      await expect(job.delete('nonexistent')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.job.delete).not.toHaveBeenCalled();
    });
  });
});
