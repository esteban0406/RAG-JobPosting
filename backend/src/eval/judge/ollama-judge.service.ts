import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
const MAX_RETRIES = 3;

@Injectable()
export class OllamaJudgeService implements IJudgeService {
  private readonly logger = new Logger(OllamaJudgeService.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('OLLAMA_URL', 'http://localhost:11434');
    this.model = config.get<string>('OLLAMA_MODEL', 'llama3.1:8b');
  }

  async judge(
    query: string,
    jobTitle: string,
    jobDescription: string,
  ): Promise<Verdict> {
    const prompt = JUDGE_PROMPT(query, jobTitle, jobDescription);
    return this.callWithRetry(prompt);
  }

  private async callWithRetry(prompt: string, attempt = 0): Promise<Verdict> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: { temperature: 0.0 },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as { response: string };
      const raw = data.response
        .trim()
        .toLowerCase()
        .replace(/[^a-z_]/g, '');

      if (VALID_VERDICTS.has(raw)) {
        return raw as Verdict;
      }

      // Try to salvage partial matches
      if (raw.includes('not_relevant') || raw.includes('not relevant'))
        return 'not_relevant';
      if (raw.includes('marginal')) return 'marginal';
      if (raw.includes('relevant')) return 'relevant';

      throw new Error(`Unexpected verdict: "${data.response.trim()}"`);
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        this.logger.warn(
          `Ollama judge attempt ${attempt + 1}/${MAX_RETRIES} failed: ${(err as Error).message}`,
        );
        return this.callWithRetry(prompt, attempt + 1);
      }
      this.logger.error(
        `Ollama judge failed after ${MAX_RETRIES} retries — defaulting to not_relevant`,
      );
      return 'not_relevant';
    }
  }
}
