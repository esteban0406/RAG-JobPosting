import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { LlmService } from '../llm/llm.service.js';
import { type JobFilters } from './job-filters.js';
import {
  TEMPLATE_KEYS,
  type TemplateKey,
} from './aggregation/query-templates.js';

export type QueryType = 'retrieval' | 'aggregation' | 'hybrid';

export interface ClassificationResult {
  type: QueryType;
  // filter_jobs is a retrieval with structured constraints (filters), not a
  // SQL template.
  intent?: TemplateKey | 'filter_jobs';
  params?: string[];
  filters?: JobFilters;
}

const AGGREGATION_PATTERN =
  /\b(how many|count|total|average|avg|salary|types? of|what .{0,30}(available|exist)|list all)\b/i;
const RETRIEVAL_PATTERN =
  /\b(find|looking for|jobs? (with|for|that)|roles? (for|with)|hiring)\b/i;
// Salary amounts, work arrangement or job type, in English or Spanish. A
// retrieval query with any of these goes to the LLM so the constraints are
// extracted as filters instead of being left to semantic similarity.
const CONSTRAINT_PATTERN =
  /(\$\s?\d|\b\d+(\.\d+)?\s?(k|mil)\b|\b\d{2,3}[,.]\d{3}\b|\b(salary|salario|sueldo|pay(ing)?|pagu?en?|remote|remot[oa]s?|on-?site|presencial|contract|contrato|full[- ]?time|tiempo completo|part[- ]?time|medio tiempo|freelance|intern(ship)?s?|pr[aá]cticas?|pasant[ií]as?)\b)/i;

const FALLBACK_RESULT: ClassificationResult = { type: 'retrieval' };

// Templates that answer with statistics, distinct values or the newest
// postings rather than a list of matching jobs. Retrieval cannot serve them,
// so they route to aggregation even when the LLM labels the query
// "retrieval" (found in the 14-oct evaluation: "what are the most recent job
// postings" came back as retrieval + recent_jobs). Listing templates
// (list_jobs_*, salary thresholds) keep the LLM's label: 51 of the 85
// retrieval test queries come back as retrieval + list_jobs_by_title/skill.
const AGGREGATION_ONLY_TEMPLATES: ReadonlySet<string> = new Set([
  'count_total',
  'count_by_location',
  'count_by_job_type',
  'count_by_company',
  'count_remote',
  'salary_stats_overall',
  'salary_stats_by_title',
  'salary_stats_by_location',
  'salary_stats_by_job_type',
  'list_distinct_titles',
  'list_distinct_locations',
  'list_distinct_skills',
  'list_distinct_companies',
  'top_hiring_companies',
  'skills_demand',
  'recent_jobs',
]);

export function buildClassifierPrompt(query: string): string {
  return `Classify this job search query into one of three types and pick the best aggregation template.

Query types:
- "retrieval"    — find/show/list specific job postings (use RAG search)
- "aggregation"  — statistical or analytical question (use SQL template only)
- "hybrid"       — both: find jobs AND compute a stat (use both)

Available SQL templates and their required params ($1, $2 are positional):
- filter_jobs                   — find jobs with structured constraints: salary, remote work and/or job type (uses "filters", see below)
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
- Use null for intent when type is "retrieval" and the query states no salary, remote or job-type constraint.
- Use filter_jobs (type: "retrieval") when the query asks for jobs of a role, skill or keyword AND states a salary threshold, remote work, or a job type, in any language. Examples: "devops jobs paying 150k+", "remote Python engineer roles", "contract frontend developer jobs", "trabajos remotos de backend que paguen más de 120 mil".
- For filter_jobs, output a "filters" object instead of "params", with only the keys the query states:
  - minSalary: number in USD per year the job must be able to pay ("over 150k", "más de 150 mil" → 150000)
  - maxSalary: number in USD per year ("under 100k" → 100000)
  - isRemote: true for remote work, false for on-site
  - jobType: one of "full_time", "part_time", "contract", "internship", "freelance"
  - title: the role or keyword with % wildcards, e.g. "%python backend%"
  - location: a place other than remote, with % wildcards, e.g. "%europe%"
- For salary-only queries (no title/keyword) use jobs_above_salary or jobs_between_salary, not filter_jobs.
- For salary threshold queries (">150K", "above 100K") use jobs_above_salary with $1 as the number in dollars (e.g. "150000").
- Always wrap ILIKE params with % wildcards.
- Params are always strings, even for numbers.

Respond with ONLY valid JSON (no markdown, no explanation).
For standard intents: {"type":"retrieval|aggregation|hybrid","intent":"<template_key or null>","params":["<param1>"]}
For filter_jobs: {"type":"retrieval","intent":"filter_jobs","filters":{"title":"%devops%","minSalary":150000,"isRemote":true}}

Query: "${query}"`;
}

// Identifies what decides the LLM call and its output (prompt and regex
// rules), so cached classifications are invalidated whenever either changes.
// route() is deterministic and reapplied to cached results instead.
export const CLASSIFIER_VERSION = createHash('sha256')
  .update(
    [
      buildClassifierPrompt(''),
      AGGREGATION_PATTERN.source,
      RETRIEVAL_PATTERN.source,
      CONSTRAINT_PATTERN.source,
    ].join('|'),
  )
  .digest('hex')
  .slice(0, 12);

@Injectable()
export class QueryClassifierService {
  private readonly logger = new Logger(QueryClassifierService.name);

  constructor(private readonly llm: LlmService) {}

  // strict: rethrow LLM call failures instead of falling back to plain
  // retrieval, so the evaluation never caches a transient error as a result.
  async classify(
    query: string,
    options: { strict?: boolean } = {},
  ): Promise<ClassificationResult> {
    const isAggregation = AGGREGATION_PATTERN.test(query);
    const isRetrieval = RETRIEVAL_PATTERN.test(query);

    if (isAggregation && isRetrieval) {
      const llmResult = await this.classifyWithLlm(query, options.strict);
      if (llmResult.intent === 'filter_jobs') return this.route(llmResult);
      return { ...llmResult, type: 'hybrid' };
    }
    if (isRetrieval && !CONSTRAINT_PATTERN.test(query)) {
      return { type: 'retrieval' };
    }

    // The aggregation regex only detects intent; choosing the SQL template
    // still requires the LLM, same as for queries no rule matches.
    return this.route(await this.classifyWithLlm(query, options.strict));
  }

  // Deterministic routing rules over the LLM's answer, idempotent so they can
  // be reapplied to cached classifications. filter_jobs is answered by
  // retrieval with filters, whatever type the LLM gave it; statistic
  // templates always aggregate; an aggregation without a known template
  // cannot be executed and falls back to retrieval.
  route(result: ClassificationResult): ClassificationResult {
    if (result.intent === 'filter_jobs') {
      return {
        type: 'retrieval',
        intent: 'filter_jobs',
        filters: result.filters,
      };
    }
    if (
      result.type === 'retrieval' &&
      result.intent &&
      AGGREGATION_ONLY_TEMPLATES.has(result.intent)
    ) {
      return { ...result, type: 'aggregation' };
    }
    if (result.type !== 'aggregation') return result;
    if (!result.intent) return FALLBACK_RESULT;
    return result;
  }

  private async classifyWithLlm(
    query: string,
    strict = false,
  ): Promise<ClassificationResult> {
    const prompt = buildClassifierPrompt(query);

    try {
      const raw = await this.llm.complete(prompt, {
        temperature: 0,
        maxOutputTokens: 150,
      });
      return this.parseClassification(raw);
    } catch (err) {
      if (strict) throw err;
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
            isRemote:
              typeof filtersRaw['isRemote'] === 'boolean'
                ? filtersRaw['isRemote']
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
