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
  salary?: string;
  contentHash: string;
}

export interface JobFilters {
  source?: string;
  location?: string;
  jobType?: string;
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

  async findAll(filters?: JobFilters): Promise<Job[]> {
    return this.prisma.job.findMany({
      where: {
        ...(filters?.source && { source: filters.source }),
        ...(filters?.location && {
          location: { contains: filters.location, mode: 'insensitive' },
        }),
        ...(filters?.jobType && { jobType: filters.jobType }),
      },
      orderBy: { fetchedAt: 'desc' },
    });
  }
}
