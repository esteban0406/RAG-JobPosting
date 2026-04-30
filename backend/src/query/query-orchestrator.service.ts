import { Injectable, Logger } from '@nestjs/common';
import type { JobSource } from '../rag/dto/rag-response.dto.js';
import { RagService } from '../rag/rag.service.js';
import { LlmService } from '../llm/llm.service.js';
import { AggregationService } from './aggregation/aggregation.service.js';
import { type JobFilters } from './aggregation/job-filter-builder.js';
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
  | { type: 'done'; sources?: JobSource[] };

@Injectable()
export class QueryOrchestratorService {
  private readonly logger = new Logger(QueryOrchestratorService.name);

  constructor(
    private readonly classifier: QueryClassifierService,
    private readonly rag: RagService,
    private readonly aggregation: AggregationService,
    private readonly llm: LlmService,
  ) {}

  async handle(
    dto: SearchQueryDto,
    userId?: string,
  ): Promise<SearchResponseDto> {
    // contextJobIds always implies retrieval — skip LLM classification
    if (dto.contextJobIds?.length) {
      return this.handleRetrieval(dto, userId);
    }

    const t0 = Date.now();
    const classification = await this.classifier.classify(dto.query);
    this.logger.debug(
      `Classification took ${Date.now() - t0}ms — type=${classification.type}`,
    );

    if (classification.type === 'retrieval') {
      return this.handleRetrieval(dto, userId);
    }
    if (classification.type === 'aggregation') {
      return this.handleAggregation(classification, dto.query);
    }
    if (classification.intent === 'filter_jobs' && classification.filters) {
      return this.handleFilterJobs(classification.filters, dto, userId);
    }
    if (!classification.intent) {
      return this.handleRetrieval(dto, userId);
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
      c.intent! as TemplateKey,
      c.params ?? [],
      query,
    );
    return {
      type: 'aggregation',
      answer: result.summary,
      retrievedAt: new Date(),
    };
  }

  private async handleHybrid(
    c: ClassificationResult,
    dto: SearchQueryDto,
    userId?: string,
  ): Promise<SearchResponseDto> {
    const [ragCtxSettled, aggSettled] = await Promise.allSettled([
      this.rag.buildContext(
        dto.query,
        { location: dto.location, jobType: dto.type },
        dto.contextJobIds,
        userId,
      ),
      this.aggregation.queryRaw(c.intent! as TemplateKey, c.params ?? []),
    ]);

    if (ragCtxSettled.status === 'rejected') {
      this.logger.warn(
        `Hybrid RAG pipeline failed: ${String(ragCtxSettled.reason)}`,
      );
      const agg = await this.aggregation.execute(
        c.intent! as TemplateKey,
        c.params ?? [],
        dto.query,
      );
      return {
        type: 'aggregation',
        answer: agg.summary,
        retrievedAt: new Date(),
      };
    }

    if (aggSettled.status === 'rejected') {
      this.logger.warn(
        `Hybrid aggregation pipeline failed: ${String(aggSettled.reason)}`,
      );
      const ragCtx = ragCtxSettled.value;
      if (!ragCtx) {
        return {
          type: 'retrieval',
          answer:
            'No relevant job postings found for your query. Try different keywords or broaden your search.',
          retrievedAt: new Date(),
        };
      }
      const answer = await this.llm.complete(ragCtx.prompt);
      return {
        type: 'retrieval',
        answer,
        sources: ragCtx.sources,
        retrievedAt: new Date(),
      };
    }

    const ragCtx = ragCtxSettled.value;
    const aggRows = aggSettled.value;

    if (!ragCtx) {
      const agg = await this.aggregation.execute(
        c.intent! as TemplateKey,
        c.params ?? [],
        dto.query,
      );
      return {
        type: 'aggregation',
        answer: agg.summary,
        retrievedAt: new Date(),
      };
    }

    const combined = await this.llm.complete(
      buildHybridPrompt(dto.query, ragCtx.contextChunks, aggRows),
    );
    return {
      type: 'hybrid',
      answer: combined,
      sources: ragCtx.sources,
      retrievedAt: new Date(),
    };
  }

  async *handleStream(
    dto: SearchQueryDto,
    userId?: string,
  ): AsyncGenerator<StreamEvent> {
    // contextJobIds always implies retrieval — skip LLM classification
    if (dto.contextJobIds?.length) {
      yield { type: 'start', queryType: 'retrieval' };
      yield* this.streamRetrieval(dto, userId);
      return;
    }

    const t0 = Date.now();
    const classification = await this.classifier.classify(dto.query);
    this.logger.debug(
      `Classification took ${Date.now() - t0}ms — type=${classification.type}`,
    );

    if (classification.type === 'aggregation') {
      yield { type: 'start', queryType: 'aggregation' };
      for await (const token of this.aggregation.executeStream(
        classification.intent! as TemplateKey,
        classification.params ?? [],
        dto.query,
      )) {
        yield { type: 'token', content: token };
      }
      yield { type: 'done' };
      return;
    }

    if (classification.type === 'retrieval') {
      yield { type: 'start', queryType: 'retrieval' };
      yield* this.streamRetrieval(dto, userId);
      return;
    }

    if (classification.intent === 'filter_jobs' && classification.filters) {
      yield { type: 'start', queryType: 'hybrid' };
      yield* this.streamFilterJobs(classification.filters, dto, userId);
      return;
    }

    if (!classification.intent) {
      yield { type: 'start', queryType: 'retrieval' };
      yield* this.streamRetrieval(dto, userId);
      return;
    }
    yield { type: 'start', queryType: 'hybrid' };
    yield* this.streamHybrid(classification, dto, userId);
  }

  private async handleFilterJobs(
    filters: JobFilters,
    dto: SearchQueryDto,
    userId?: string,
  ): Promise<SearchResponseDto> {
    const aggRows = await this.aggregation
      .queryFiltered(filters)
      .catch((err: unknown) => {
        this.logger.warn(`Filter jobs aggregation failed: ${String(err)}`);
        return [] as Record<string, unknown>[];
      });

    const aggJobIds = aggRows.map((r) => r['id'] as string).filter(Boolean);

    const ragCtx = await this.rag
      .buildContext(
        dto.query,
        { location: dto.location, jobType: dto.type },
        aggJobIds.length > 0 ? aggJobIds : undefined,
        userId,
      )
      .catch(() => null);

    if (!ragCtx) {
      return {
        type: 'retrieval',
        answer:
          'No relevant job postings found for your query. Try different keywords or broaden your search.',
        retrievedAt: new Date(),
      };
    }

    const answer = await this.llm.complete(
      buildHybridPrompt(dto.query, ragCtx.contextChunks, aggRows),
    );
    return {
      type: 'hybrid',
      answer,
      sources: ragCtx.sources,
      retrievedAt: new Date(),
    };
  }

  private async *streamFilterJobs(
    filters: JobFilters,
    dto: SearchQueryDto,
    userId?: string,
  ): AsyncGenerator<StreamEvent> {
    const aggRows = await this.aggregation
      .queryFiltered(filters)
      .catch((err: unknown) => {
        this.logger.warn(`Filter jobs aggregation failed: ${String(err)}`);
        return [] as Record<string, unknown>[];
      });

    const aggJobIds = aggRows.map((r) => r['id'] as string).filter(Boolean);

    const ragCtx = await this.rag
      .buildContext(
        dto.query,
        { location: dto.location, jobType: dto.type },
        aggJobIds.length > 0 ? aggJobIds : undefined,
        userId,
      )
      .catch(() => null);

    if (!ragCtx) {
      yield {
        type: 'token',
        content:
          'No relevant job postings found for your query. Try different keywords or broaden your search.',
      };
      yield { type: 'done' };
      return;
    }

    for await (const token of this.llm.completeStream(
      buildHybridPrompt(dto.query, ragCtx.contextChunks, aggRows),
    )) {
      yield { type: 'token', content: token };
    }
    yield { type: 'done', sources: ragCtx.sources };
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
      this.aggregation.queryRaw(c.intent! as TemplateKey, c.params ?? []),
    ]);

    if (!ragCtx) {
      for await (const token of this.aggregation.executeStream(
        c.intent! as TemplateKey,
        c.params ?? [],
        dto.query,
      )) {
        yield { type: 'token', content: token };
      }
      yield { type: 'done' };
      return;
    }

    for await (const token of this.llm.completeStream(
      buildHybridPrompt(dto.query, ragCtx.contextChunks, aggRows),
    )) {
      yield { type: 'token', content: token };
    }
    yield { type: 'done', sources: ragCtx.sources };
  }
}

function buildHybridPrompt(
  query: string,
  contextChunks: string,
  aggRows: Record<string, unknown>[],
): string {
  return `You are a job search assistant. Answer the user's question using BOTH the job listings and the statistical data below.
Be concise and specific. Do not fabricate details. If salary or other details are not available for a listing, say so.

Job listings:
${contextChunks}

Statistical data:
${JSON.stringify(aggRows, null, 2)}

User question: ${query}

Answer:`;
}
