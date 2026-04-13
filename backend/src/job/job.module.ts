import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { JobController } from './job.controller.js';
import { JobService } from './job.service.js';

@Module({
  imports: [StorageModule, AuthModule],
  controllers: [JobController],
  providers: [JobService],
})
export class JobModule {}
