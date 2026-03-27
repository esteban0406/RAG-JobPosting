import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module.js';
import { QueryController } from './query.controller.js';
import { QueryService } from './query.service.js';

@Module({
  imports: [RagModule],
  controllers: [QueryController],
  providers: [QueryService],
})
export class QueryModule {}
