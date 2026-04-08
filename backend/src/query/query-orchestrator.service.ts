import { Injectable, Logger } from '@nestjs/common';
import type { RagResponse } from '../rag/dto/rag-response.dto.js';
import { RagService } from '../rag/rag.service.js';
import { LlmService } from '../llm/llm.service.js';
import { AggregationService } from './aggregation/aggregation.service.js';
import type { TemplateKey } from './aggregation/query-templates.js';
import {
  QueryClassifierService,
  type ClassificationResult,
} from './query-classifier.service.js';
import { SearchQueryDto } from './dto/search-query.dto.js';
import { SearchResponseDto } from './dto/search-response.dto.js';

@Injectable()
export class QueryOrchestratorService {
  private readonly logger = new Logger(QueryOrchestratorService.name);

  constructor(
    private readonly classifier: QueryClassifierService,
    private readonly rag: RagService,
    private readonly aggregation: AggregationService,
    private readonly llm: LlmService,
  ) {}

  async handle(dto: SearchQueryDto): Promise<SearchResponseDto> {
    const classification = await this.classifier.classify(dto.query);

    if (classification.type === 'retrieval') {
      return this.handleRetrieval(dto);
    }
    if (classification.type === 'aggregation') {
      return this.handleAggregation(classification, dto.query);
    }
    return this.handleHybrid(classification, dto);
  }

  private async handleRetrieval(
    dto: SearchQueryDto,
  ): Promise<SearchResponseDto> {
    const result = await this.rag.query(dto.query, {
      location: dto.location,
      jobType: dto.type,
    });
    return {
      type: 'retrieval',
      answer: result.answer,
      sources: result.sources,
      retrievedAt: result.retrievedAt,
    };
  }

  private async handleAggregation(
    c: ClassificationResult,
    query: string,
  ): Promise<SearchResponseDto> {
    const result = await this.aggregation.execute(
      c.intent!,
      c.params ?? [],
      query,
    );
    return {
      type: 'aggregation',
      answer: result.summary,
      aggregation: { intent: result.intent, rows: result.rows },
      retrievedAt: new Date(),
    };
  }

  private async handleHybrid(
    c: ClassificationResult,
    dto: SearchQueryDto,
  ): Promise<SearchResponseDto> {
    const [ragSettled, aggSettled] = await Promise.allSettled([
      this.rag.query(dto.query, { location: dto.location, jobType: dto.type }),
      this.aggregation.queryRaw(c.intent!, c.params ?? []),
    ]);

    if (ragSettled.status === 'rejected') {
      this.logger.warn(
        `Hybrid RAG pipeline failed: ${String(ragSettled.reason)}`,
      );
      const rows = aggSettled.status === 'fulfilled' ? aggSettled.value : [];
      const agg = await this.aggregation.execute(
        c.intent!,
        c.params ?? [],
        dto.query,
      );
      return {
        type: 'aggregation',
        answer: agg.summary,
        aggregation: { intent: c.intent as TemplateKey, rows },
        retrievedAt: new Date(),
      };
    }

    if (aggSettled.status === 'rejected') {
      this.logger.warn(
        `Hybrid aggregation pipeline failed: ${String(aggSettled.reason)}`,
      );
      const r = ragSettled.value;
      return {
        type: 'retrieval',
        answer: r.answer,
        sources: r.sources,
        retrievedAt: r.retrievedAt,
      };
    }

    const ragResult = ragSettled.value;
    const aggRows = aggSettled.value;

    const combined = await this.llm.complete(
      buildHybridPrompt(dto.query, ragResult, aggRows),
    );
    return {
      type: 'hybrid',
      answer: combined,
      sources: ragResult.sources,
      aggregation: { intent: c.intent as TemplateKey, rows: aggRows },
      retrievedAt: new Date(),
    };
  }
}

function buildHybridPrompt(
  query: string,
  rag: RagResponse,
  aggRows: Record<string, unknown>[],
): string {
  const listings = rag.sources
    .map((s) => `- ${s.title} at ${s.company}`)
    .join('\n');
  return `You are a job search assistant. Answer the user's question using BOTH the job listings and the statistical data below.
Be concise. Do not fabricate details.

Relevant job listings:
${listings}

Statistical data:
${JSON.stringify(aggRows, null, 2)}

User question: ${query}

Answer:`;
}
