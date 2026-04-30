import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service.js';
import { type JobFilters } from './aggregation/job-filter-builder.js';
import {
  TEMPLATE_KEYS,
  type TemplateKey,
} from './aggregation/query-templates.js';

export type QueryType = 'retrieval' | 'aggregation' | 'hybrid';

export interface ClassificationResult {
  type: QueryType;
  intent?: TemplateKey | 'filter_jobs';
  params?: string[];
  filters?: JobFilters;
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

    if (isAggregation && isRetrieval) {
      const llmResult = await this.classifyWithLlm(query);
      return { ...llmResult, type: 'hybrid' };
    }
    if (isAggregation) return { type: 'aggregation' };
    if (isRetrieval) return { type: 'retrieval' };

    return this.classifyWithLlm(query);
  }

  private async classifyWithLlm(query: string): Promise<ClassificationResult> {
    const prompt = `Classify this job search query into one of three types and pick the best aggregation template.

Query types:
- "retrieval"    — find/show/list specific job postings (use RAG search)
- "aggregation"  — statistical or analytical question (use SQL template only)
- "hybrid"       — both: find jobs AND compute a stat (use both)

Available SQL templates and their required params ($1, $2 are positional):
- filter_jobs                   — compound filter: title + salary + location + jobType (any combination)
- count_total                   — no params
- count_by_location             — no params
- count_by_job_type             — no params
- count_by_company              — no params
- count_remote                  — no params
- salary_stats_overall          — no params
- salary_stats_by_title         — $1='%keyword%'
- salary_stats_by_location      — no params
- salary_stats_by_job_type      — no params
- jobs_above_salary             — $1=threshold e.g. '150000'
- jobs_between_salary           — $1=lower, $2=upper e.g. '80000','120000'
- list_jobs_by_title            — $1='%keyword%'
- list_jobs_by_location         — $1='%city%'
- list_jobs_by_company          — $1='%company%'
- list_jobs_by_type             — $1='%type%' e.g. '%contract%'
- list_remote_jobs              — no params
- list_jobs_by_skill            — $1=exact skill e.g. 'Python'
- list_distinct_titles          — $1='%keyword%'
- list_distinct_locations       — no params
- list_distinct_skills          — no params
- list_distinct_companies       — $1='%keyword%'
- top_hiring_companies          — no params
- skills_demand                 — no params
- recent_jobs                   — no params

Rules:
- Use null for intent when type is "retrieval".
- Use filter_jobs (type: "hybrid") when the query combines a job title/keyword with salary, location, or job-type constraints. Example: "devops jobs paying 150k+" or "remote Python engineer roles".
- For filter_jobs, output a "filters" object instead of "params". Include only the relevant keys. Salary values are numbers. title/location/jobType use % wildcards for ILIKE.
- For salary-only queries (no title/keyword) use jobs_above_salary or jobs_between_salary, not filter_jobs.
- For salary threshold queries (">150K", "above 100K") use jobs_above_salary with $1 as the number in dollars (e.g. "150000").
- Always wrap ILIKE params with % wildcards.
- Params are always strings, even for numbers.

Respond with ONLY valid JSON (no markdown, no explanation).
For standard intents: {"type":"retrieval|aggregation|hybrid","intent":"<template_key or null>","params":["<param1>"]}
For filter_jobs: {"type":"hybrid","intent":"filter_jobs","filters":{"title":"%devops%","minSalary":150000}}

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
      const filtersRaw = json['filters'] as Record<string, unknown> | undefined;

      const result: ClassificationResult = { type };

      if (intent === 'filter_jobs') {
        result.intent = 'filter_jobs';
        if (filtersRaw && typeof filtersRaw === 'object') {
          result.filters = {
            title:
              typeof filtersRaw['title'] === 'string'
                ? filtersRaw['title']
                : undefined,
            minSalary:
              filtersRaw['minSalary'] !== undefined
                ? Number(filtersRaw['minSalary'])
                : undefined,
            maxSalary:
              filtersRaw['maxSalary'] !== undefined
                ? Number(filtersRaw['maxSalary'])
                : undefined,
            location:
              typeof filtersRaw['location'] === 'string'
                ? filtersRaw['location']
                : undefined,
            jobType:
              typeof filtersRaw['jobType'] === 'string'
                ? filtersRaw['jobType']
                : undefined,
          };
        }
      } else if (intent && TEMPLATE_KEYS.includes(intent as TemplateKey)) {
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
