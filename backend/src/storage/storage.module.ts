import { Module } from '@nestjs/common';
import { JobRepository } from './job.repository.js';
import { PrismaService } from './prisma.service.js';
import { VectorRepository } from './vector.repository.js';

@Module({
  providers: [PrismaService, JobRepository, VectorRepository],
  exports: [PrismaService, JobRepository, VectorRepository],
})
export class StorageModule {}
