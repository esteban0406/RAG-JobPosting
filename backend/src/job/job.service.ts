import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import type { Job } from '../../generated/prisma/client.js';
import { JobRepository } from '../storage/job.repository.js';
import type { CreateJobDto } from './dto/create-job.dto.js';
import type { JobFilterDto } from './dto/job-filter.dto.js';
import type { UpdateJobDto } from './dto/update-job.dto.js';

export interface JobListResult {
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class JobService {
  constructor(private readonly jobRepository: JobRepository) {}

  async list(filters: JobFilterDto): Promise<JobListResult> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const [jobs, total] = await Promise.all([
      this.jobRepository.findAll(filters),
      this.jobRepository.count(filters),
    ]);
    return { jobs, total, page, limit };
  }

  async getById(id: string): Promise<Job> {
    const job = await this.jobRepository.findById(id);
    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }
    return job;
  }

  async create(dto: CreateJobDto): Promise<Job> {
    const contentHash = createHash('sha256')
      .update(
        `${dto.title}|${dto.company}|${dto.description}|${dto.location ?? ''}`,
      )
      .digest('hex');

    return this.jobRepository.createJob({
      sourceId: contentHash.slice(0, 16),
      source: 'manual',
      title: dto.title,
      company: dto.company,
      description: dto.description,
      url: dto.url,
      location: dto.location,
      jobType: dto.jobType,
      minSalary: dto.minSalary,
      maxSalary: dto.maxSalary,
      contentHash,
    });
  }

  async update(id: string, dto: UpdateJobDto): Promise<Job> {
    await this.getById(id);
    return this.jobRepository.updateJob(id, dto);
  }

  async delete(id: string): Promise<void> {
    await this.getById(id);
    await this.jobRepository.deleteJob(id);
  }
}
