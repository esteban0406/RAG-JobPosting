import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service.js';
import { IJudgeService, Verdict } from './judge.interface.js';

const JUDGE_PROMPT = (query: string, title: string, desc: string) =>
  `
You are a strict classifier.

Rules:
- Output EXACTLY one of: relevant, marginal, not_relevant
- Do NOT explain
- Do NOT output anything else

Definitions:
- relevant: strong match to the query
- marginal: partial or weak match
- not_relevant: unrelated

Query: "${query}"
Job title: "${title}"
Job description: "${desc.slice(0, 300)}"

Answer:
`.trim();

const VALID_VERDICTS = new Set<string>([
  'relevant',
  'marginal',
  'not_relevant',
]);

@Injectable()
export class GeminiJudgeService implements IJudgeService {
  private readonly logger = new Logger(GeminiJudgeService.name);

  constructor(private readonly llmService: LlmService) {}

  async judge(
    query: string,
    jobTitle: string,
    jobDescription: string,
  ): Promise<Verdict> {
    const prompt = JUDGE_PROMPT(query, jobTitle, jobDescription);
    const raw = await this.llmService.complete(prompt, {
      temperature: 0,
      maxOutputTokens: 10,
    });
    const normalized = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z_]/g, '');

    if (VALID_VERDICTS.has(normalized)) {
      return normalized as Verdict;
    }

    // Try to salvage partial matches
    if (
      normalized.includes('not_relevant') ||
      normalized.includes('not relevant')
    )
      return 'not_relevant';
    if (normalized.includes('marginal')) return 'marginal';
    if (normalized.includes('relevant')) return 'relevant';

    this.logger.warn(
      `Unexpected Gemini verdict "${raw.trim()}" — defaulting to not_relevant`,
    );
    return 'not_relevant';
  }
}
