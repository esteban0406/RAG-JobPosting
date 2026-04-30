import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service.js';
import { AggregationRepository } from './aggregation.repository.js';
import { type JobFilters } from './job-filter-builder.js';
import { type TemplateKey } from './query-templates.js';

export interface AggregationResult {
  intent: TemplateKey;
  rows: Record<string, unknown>[];
  summary: string;
}

@Injectable()
export class AggregationService {
  constructor(
    private readonly repo: AggregationRepository,
    private readonly llm: LlmService,
  ) {}

  async queryRaw(
    intent: TemplateKey,
    params: string[] = [],
  ): Promise<Record<string, unknown>[]> {
    return this.repo.execute(intent, params);
  }

  async queryFiltered(filters: JobFilters): Promise<Record<string, unknown>[]> {
    return this.repo.executeFiltered(filters);
  }

  async execute(
    intent: TemplateKey,
    params: string[],
    originalQuery: string,
  ): Promise<AggregationResult> {
    const rows = await this.queryRaw(intent, params);
    if (rows.length === 0) {
      return { intent, rows: [], summary: 'No data found for this query.' };
    }
    const summary = await this.llm.complete(
      buildAggregationPrompt(originalQuery, rows),
    );
    return { intent, rows, summary };
  }

  async *executeStream(
    intent: TemplateKey,
    params: string[],
    originalQuery: string,
  ): AsyncGenerator<string> {
    const rows = await this.queryRaw(intent, params);
    if (rows.length === 0) {
      yield 'No data found for this query.';
      return;
    }
    yield* this.llm.completeStream(buildAggregationPrompt(originalQuery, rows));
  }
}

function buildAggregationPrompt(
  query: string,
  rows: Record<string, unknown>[],
): string {
  return `You are a job search assistant. Summarize the following data in 2-3 sentences to answer the user's question.
Be concise and factual. Do not fabricate details.

Data:
${JSON.stringify(rows, null, 2)}

User question: ${query}

Answer:`;
}
