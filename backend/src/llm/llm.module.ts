import { Module } from '@nestjs/common';
import { LlmService } from './llm.service.js';
import { JobParserService } from './job-parser.service.js';

@Module({
  providers: [LlmService, JobParserService],
  exports: [LlmService, JobParserService],
})
export class LlmModule {}
