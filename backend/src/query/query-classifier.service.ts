import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service.js';
import {
  TEMPLATE_KEYS,
  type TemplateKey,
} from './aggregation/query-templates.js';

export type QueryType = 'retrieval' | 'aggregation' | 'hybrid';

export interface ClassificationResult {
  type: QueryType;
  intent?: TemplateKey;
  params?: string[];
}

const AGGREGATION_PATTERN =
  /\b(how many|count|total|average|avg|salary|types? of|what .{0,30}(available|exist)|list all)\b/i;
const RETRIEVAL_PATTERN =
  /\b(find|looking for|jobs? (with|for|that)|roles? (for|with)|hiring)\b/i;

const FALLBACK_RESULT: ClassificationResult = { type: 'retrieval' };

@Injectable()
export class QueryClassifierService {
  private readonly logger = new Logger(QueryClassifierService.name);

  constructor(private readonly llm: LlmService) {}

  async classify(query: string): Promise<ClassificationResult> {
    const isAggregation = AGGREGATION_PATTERN.test(query);
    const isRetrieval = RETRIEVAL_PATTERN.test(query);

    if (isAggregation && isRetrieval) return { type: 'hybrid' };
    if (isAggregation) return { type: 'aggregation' };
    if (isRetrieval) return { type: 'retrieval' };

    return this.classifyWithLlm(query);
  }

  private async classifyWithLlm(query: string): Promise<ClassificationResult> {
    const prompt = `Classify this job search query. Available aggregation templates: ${TEMPLATE_KEYS.join(', ')}.
Searchable fields: title, company, location, jobType, minSalary, maxSalary.

Respond with ONLY valid JSON (no markdown, no explanation):
{"type":"retrieval|aggregation|hybrid","intent":"<template_key_or_null>","params":["<keyword_if_needed>"]}

Query: "${query}"`;

    try {
      const raw = await this.llm.complete(prompt, {
        temperature: 0,
        maxOutputTokens: 100,
      });
      return this.parseClassification(raw);
    } catch (err) {
      this.logger.warn(
        `LLM classifier failed, defaulting to retrieval: ${(err as Error).message}`,
      );
      return FALLBACK_RESULT;
    }
  }

  private parseClassification(raw: string): ClassificationResult {
    try {
      const json = JSON.parse(raw.trim()) as Record<string, unknown>;
      const type = json['type'] as string;

      if (type !== 'retrieval' && type !== 'aggregation' && type !== 'hybrid') {
        return FALLBACK_RESULT;
      }

      const intent = json['intent'] as string | null | undefined;
      const params = json['params'] as string[] | undefined;

      const result: ClassificationResult = { type };

      if (intent && TEMPLATE_KEYS.includes(intent as TemplateKey)) {
        result.intent = intent as TemplateKey;
      }
      if (Array.isArray(params) && params.length > 0) {
        result.params = params.filter((p) => typeof p === 'string');
      }

      return result;
    } catch {
      this.logger.warn(
        'Failed to parse LLM classification response, defaulting to retrieval',
      );
      return FALLBACK_RESULT;
    }
  }
}
