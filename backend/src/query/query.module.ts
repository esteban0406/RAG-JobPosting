import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { RagModule } from '../rag/rag.module.js';
import { AggregationRepository } from './aggregation/aggregation.repository.js';
import { AggregationService } from './aggregation/aggregation.service.js';
import { QueryController } from './query.controller.js';
import { QueryClassifierService } from './query-classifier.service.js';
import { QueryOrchestratorService } from './query-orchestrator.service.js';
import { QueryService } from './query.service.js';

@Module({
  imports: [RagModule, LlmModule, AuthModule],
  controllers: [QueryController],
  providers: [
    QueryService,
    QueryClassifierService,
    QueryOrchestratorService,
    AggregationRepository,
    AggregationService,
  ],
})
export class QueryModule {}
