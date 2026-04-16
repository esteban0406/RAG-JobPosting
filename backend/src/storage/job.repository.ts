import { Injectable } from '@nestjs/common';
import { Job } from '../../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

export interface UpsertJobDto {
  sourceId: string;
  source: string;
  title: string;
  company: string;
  location?: string;
  description: string;
  url: string;
  jobType?: string;
  minSalary?: number;
  maxSalary?: number;
  contentHash: string;
  summary?: string | null;
  salary?: string | null;
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
  skills?: string[];
  logo?: string | null;
}

export interface JobFilters {
  source?: string;
  location?: string;
  jobType?: string;
  keyword?: string;
  minSalary?: number;
  maxSalary?: number;
  page?: number;
  limit?: number;
}

@Injectable()
export class JobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertJob(data: UpsertJobDto): Promise<Job> {
    return this.prisma.job.upsert({
      where: {
        source_sourceId: { source: data.source, sourceId: data.sourceId },
      },
      create: { ...data, fetchedAt: new Date() },
      update: { ...data, fetchedAt: new Date() },
    });
  }

  async findByContentHash(hash: string): Promise<Job | null> {
    return this.prisma.job.findFirst({ where: { contentHash: hash } });
  }

  async findByIds(ids: string[]): Promise<Job[]> {
    return this.prisma.job.findMany({ where: { id: { in: ids } } });
  }

  async findAll(filters?: JobFilters): Promise<Job[]> {
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters?.limit ?? 20));
    return this.prisma.job.findMany({
      where: this.buildWhere(filters),
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async count(filters?: JobFilters): Promise<number> {
    return this.prisma.job.count({ where: this.buildWhere(filters) });
  }

  async findById(id: string): Promise<Job | null> {
    return this.prisma.job.findUnique({ where: { id } });
  }

  async createJob(
    data: Omit<UpsertJobDto, 'sourceId'> & { sourceId: string },
  ): Promise<Job> {
    return this.prisma.job.create({ data: { ...data, fetchedAt: new Date() } });
  }

  async updateJob(id: string, data: Partial<UpsertJobDto>): Promise<Job> {
    return this.prisma.job.update({ where: { id }, data });
  }

  async deleteJob(id: string): Promise<void> {
    await this.prisma.job.delete({ where: { id } });
  }

  private buildWhere(filters?: JobFilters) {
    return {
      ...(filters?.source && { source: filters.source }),
      ...(filters?.location && {
        location: { contains: filters.location, mode: 'insensitive' as const },
      }),
      ...(filters?.jobType && { jobType: filters.jobType }),
      ...(filters?.keyword && {
        OR: [
          {
            title: { contains: filters.keyword, mode: 'insensitive' as const },
          },
          {
            company: {
              contains: filters.keyword,
              mode: 'insensitive' as const,
            },
          },
        ],
      }),
      ...(filters?.minSalary !== undefined && {
        maxSalary: { gte: filters.minSalary },
      }),
      ...(filters?.maxSalary !== undefined && {
        minSalary: { lte: filters.maxSalary },
      }),
    };
  }
}
