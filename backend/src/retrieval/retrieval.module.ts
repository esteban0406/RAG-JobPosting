import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { Bm25IndexService } from './bm25-index.service.js';
import { RerankService } from './rerank.service.js';
import { RetrievalPipeline } from './retrieval-pipeline.service.js';

@Module({
  imports: [EmbeddingModule, StorageModule],
  providers: [Bm25IndexService, RerankService, RetrievalPipeline],
  exports: [Bm25IndexService, RerankService, RetrievalPipeline],
})
export class RetrievalModule {}
