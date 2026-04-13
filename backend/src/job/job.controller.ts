import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Job } from '../../generated/prisma/client.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtGuard } from '../auth/guards/jwt.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { JobFilterDto } from './dto/job-filter.dto.js';
import { UpdateJobDto } from './dto/update-job.dto.js';
import { JobService, type JobListResult } from './job.service.js';

@Controller('jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Get()
  list(@Query() filters: JobFilterDto): Promise<JobListResult> {
    return this.jobService.list(filters);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<Job> {
    return this.jobService.getById(id);
  }

  @Post()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateJobDto): Promise<Job> {
    return this.jobService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateJobDto): Promise<Job> {
    return this.jobService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string): Promise<void> {
    return this.jobService.delete(id);
  }
}
