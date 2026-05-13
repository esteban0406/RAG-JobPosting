import { Module } from '@nestjs/common';
import { JobRepository } from './job.repository.js';
import { PrismaService } from './prisma.service.js';
import { R2StorageService } from './r2-storage.service.js';
import { VectorRepository } from './vector.repository.js';

@Module({
  providers: [PrismaService, JobRepository, VectorRepository, R2StorageService],
  exports: [PrismaService, JobRepository, VectorRepository, R2StorageService],
})
export class StorageModule {}
