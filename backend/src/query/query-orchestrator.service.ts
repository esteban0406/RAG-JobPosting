import { Injectable, Logger } from '@nestjs/common';
import type { JobSource } from '../rag/dto/rag-response.dto.js';
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

export type StreamEvent =
  | { type: 'start'; queryType: string }
  | { type: 'token'; content: string }
  | { type: 'done'; sources?: JobSource[]; aggregation?: { intent: string; rows: Record<string, unknown>[] } | null };

@Injectable()
export class QueryOrchestratorService {
  private readonly logger = new Logger(QueryOrchestratorService.name);

  constructor(
    private readonly classifier: QueryClassifierService,
    private readonly rag: RagService,
    private readonly aggregation: AggregationService,
    private readonly llm: LlmService,
  ) {}

  async handle(dto: SearchQueryDto, userId?: string): Promise<SearchResponseDto> {
    const classification = await this.classifier.classify(dto.query);

    if (classification.type === 'retrieval') {
      return this.handleRetrieval(dto, userId);
    }
    if (classification.type === 'aggregation') {
      return this.handleAggregation(classification, dto.query);
    }
    return this.handleHybrid(classification, dto, userId);
  }

  private async handleRetrieval(
    dto: SearchQueryDto,
    userId?: string,
  ): Promise<SearchResponseDto> {
    const result = await this.rag.query(
      dto.query,
      { location: dto.location, jobType: dto.type },
      dto.contextJobIds,
      userId,
    );
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
    userId?: string,
  ): Promise<SearchResponseDto> {
    const [ragSettled, aggSettled] = await Promise.allSettled([
      this.rag.query(
        dto.query,
        { location: dto.location, jobType: dto.type },
        dto.contextJobIds,
        userId,
      ),
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
      buildHybridPrompt(dto.query, ragResult.sources, aggRows),
    );
    return {
      type: 'hybrid',
      answer: combined,
      sources: ragResult.sources,
      aggregation: { intent: c.intent as TemplateKey, rows: aggRows },
      retrievedAt: new Date(),
    };
  }

  async *handleStream(dto: SearchQueryDto, userId?: string): AsyncGenerator<StreamEvent> {
    const classification = await this.classifier.classify(dto.query);

    if (classification.type === 'aggregation') {
      yield { type: 'start', queryType: 'aggregation' };
      const result = await this.aggregation.execute(
        classification.intent!,
        classification.params ?? [],
        dto.query,
      );
      yield {
        type: 'done',
        aggregation: { intent: result.intent, rows: result.rows },
      };
      return;
    }

    if (classification.type === 'retrieval') {
      yield { type: 'start', queryType: 'retrieval' };
      yield* this.streamRetrieval(dto, userId);
      return;
    }

    yield { type: 'start', queryType: 'hybrid' };
    yield* this.streamHybrid(classification, dto, userId);
  }

  private async *streamRetrieval(
    dto: SearchQueryDto,
    userId?: string,
  ): AsyncGenerator<StreamEvent> {
    for await (const chunk of this.rag.queryStream(
      dto.query,
      { location: dto.location, jobType: dto.type },
      dto.contextJobIds,
      userId,
    )) {
      if (typeof chunk === 'string') {
        yield { type: 'token', content: chunk };
      } else {
        yield { type: 'done', sources: chunk.sources };
      }
    }
  }

  private async *streamHybrid(
    c: ClassificationResult,
    dto: SearchQueryDto,
    userId?: string,
  ): AsyncGenerator<StreamEvent> {
    const [ragCtx, aggRows] = await Promise.all([
      this.rag.buildContext(
        dto.query,
        { location: dto.location, jobType: dto.type },
        dto.contextJobIds,
        userId,
      ),
      this.aggregation.queryRaw(c.intent!, c.params ?? []),
    ]);

    if (!ragCtx) {
      const agg = await this.aggregation.execute(
        c.intent!,
        c.params ?? [],
        dto.query,
      );
      yield { type: 'done', aggregation: { intent: agg.intent, rows: agg.rows } };
      return;
    }

    for await (const token of this.llm.completeStream(
      buildHybridPrompt(dto.query, ragCtx.sources, aggRows),
    )) {
      yield { type: 'token', content: token };
    }
    yield {
      type: 'done',
      sources: ragCtx.sources,
      aggregation: { intent: c.intent as TemplateKey, rows: aggRows },
    };
  }
}

function buildHybridPrompt(
  query: string,
  sources: JobSource[],
  aggRows: Record<string, unknown>[],
): string {
  const listings = sources
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
