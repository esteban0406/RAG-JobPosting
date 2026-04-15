import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { NULL_PARSED_JOB, ParsedJobDto } from './parsed-job.dto.js';

const SYSTEM_PROMPT = `You are a strict information extraction system for job postings.

Your task is to extract structured data from the job description provided by the user.

Return ONLY a valid JSON object with EXACTLY these keys:
{
  "summary": string | null,
  "salary": string | null,
  "responsibilities": string[] | null,
  "requirements": string[] | null,
  "benefits": string[] | null,
  "tools": string[] | null
}

-----------------------
EXTRACTION RULES
-----------------------

GENERAL:
- Extract information exactly as written. Do NOT rewrite or summarize list items.
- Do NOT hallucinate or infer missing data.
- If a field is not present, return null.
- Prefer completeness over brevity (do not limit the number of items).
- Use null instead of empty arrays.

SUMMARY:
- 2–3 sentence high-level overview of the role.
- Do not include benefits, salary, or company marketing content.

RESPONSIBILITIES:
- Extract ALL responsibilities from sections like:
  "Responsibilities", "What you'll do", "Key Responsibilities", etc.
- Each item must be a clear, standalone action.
- Preserve original wording as much as possible.
- Remove duplicates and near-duplicates.

REQUIREMENTS:
- Extract ALL requirements from sections like:
  "Requirements", "Qualifications", "What we're looking for", etc.
- Include skills, experience, education, and domain knowledge.
- Keep each requirement as a separate item.
- Do NOT merge multiple requirements into one.

BENEFITS:
- Extract ALL benefits, perks, and compensation-related extras.
- Include items like: bonuses, insurance, PTO, stock plans, wellness programs, etc.
- Ignore generic company culture statements.

TOOLS:
- Extract ONLY specific technologies, tools, platforms, frameworks, or software.
- Examples: "React", "Node.js", "PostgreSQL", "AWS", "Salesforce Marketing Cloud"

STRICT TOOL RULES:
- DO NOT include:
  - generic terms (e.g., "analytics", "AI", "cloud", "CRM", "agents")
  - company names unless they are clearly tools or platforms
  - random nouns, adjectives, or irrelevant words
- Deduplicate tools (keep the most specific name, e.g. prefer "Salesforce Marketing Cloud" over "Salesforce")

SALARY:
- Extract salary exactly as written (range, currency, format).
- Do NOT calculate or transform values.

-----------------------
OUTPUT FORMAT
-----------------------

- Return ONLY valid JSON.
- No markdown, no code blocks, no explanations, no trailing commas.
- Start your response with { and end with }. Output nothing else.`;

export class DailyQuotaExhaustedException extends Error {
  constructor() {
    super('Groq daily quota exhausted');
  }
}

@Injectable()
export class JobParserService {
  private readonly logger = new Logger(JobParserService.name);
  private readonly isDev: boolean;
  private readonly ollamaUrl: string;
  private readonly ollamaModel: string;
  private readonly groq: Groq | null = null;

  constructor(private readonly config: ConfigService) {
    this.isDev = config.get<string>('NODE_ENV') !== 'production';
    this.ollamaUrl = `${config.get<string>('OLLAMA_URL') ?? 'http://localhost:11434'}/v1/chat/completions`;
    this.ollamaModel = config.get<string>('OLLAMA_MODEL') ?? 'llama3.1:8b';

    if (!this.isDev) {
      const apiKey = config.get<string>('GROQ_API_KEY');
      if (!apiKey) throw new Error('GROQ_API_KEY is required in production');
      this.groq = new Groq({ apiKey });
    }
  }

  async parse(text: string): Promise<ParsedJobDto> {
    if (this.isDev) {
      return this.parseWithOllama(text);
    }
    return this.parseWithGroq(text);
  }

  // ── Ollama (dev) ──────────────────────────────────────────────────────────

  private async parseWithOllama(text: string): Promise<ParsedJobDto> {
    try {
      const res = await fetch(this.ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.ollamaModel,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text },
          ],
          stream: false,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        this.logger.warn(`Ollama returned ${res.status}, using null parse`);
        return NULL_PARSED_JOB;
      }

      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content ?? '';
      return this.extractJson(content);
    } catch (err) {
      this.logger.warn(`Ollama parse error: ${(err as Error).message}`);
      return NULL_PARSED_JOB;
    }
  }

  // ── Groq (prod) ───────────────────────────────────────────────────────────

  private async parseWithGroq(
    text: string,
    attempt = 0,
  ): Promise<ParsedJobDto> {
    try {
      const completion = await this.groq!.chat.completions.create({
        model: 'qwen/qwen3-32b',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_completion_tokens: 2048,
        stream: false,
      });

      const content = completion.choices[0]?.message?.content ?? '';
      return this.extractJson(content);
    } catch (err: unknown) {
      return this.handleGroqError(err, text, attempt);
    }
  }

  private async handleGroqError(
    err: unknown,
    text: string,
    attempt: number,
  ): Promise<ParsedJobDto> {
    // Groq SDK wraps HTTP errors as APIError instances with a .status property
    const status = (err as { status?: number }).status;
    const message = (err as Error).message ?? '';

    if (status === 429) {
      // Check if this is a daily quota error (no retry-after / explicit message)
      const isDaily =
        message.toLowerCase().includes('rate_limit_exceeded') &&
        !this.hasRetryAfter(err);

      if (isDaily) {
        this.logger.error('Groq daily quota exhausted — aborting parse queue');
        throw new DailyQuotaExhaustedException();
      }

      // Per-minute rate limit — retry up to 3 times
      if (attempt >= 3) {
        this.logger.warn('Groq per-minute limit: max retries reached');
        return NULL_PARSED_JOB;
      }

      const retryAfter = this.getRetryAfter(err) ?? Math.pow(2, attempt) * 5;
      this.logger.warn(
        `Groq rate limited (429), retrying in ${retryAfter}s (attempt ${attempt + 1}/3)`,
      );
      await this.sleep(retryAfter * 1000);
      return this.parseWithGroq(text, attempt + 1);
    }

    // Any other error — log and return null parse
    this.logger.warn(`Groq parse error (${status ?? 'unknown'}): ${message}`);
    return NULL_PARSED_JOB;
  }

  private hasRetryAfter(err: unknown): boolean {
    const headers = (err as { headers?: Record<string, string> }).headers;
    return !!(
      headers?.['retry-after'] || headers?.['x-ratelimit-reset-requests']
    );
  }

  private getRetryAfter(err: unknown): number | null {
    const headers = (err as { headers?: Record<string, string> }).headers;
    const value = headers?.['retry-after'];
    if (!value) return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }

  // ── JSON extraction ───────────────────────────────────────────────────────

  private extractJson(raw: string): ParsedJobDto {
    // Strip markdown code fences if the model ignored the instruction
    const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');

    // Try direct parse first
    try {
      return this.validate(JSON.parse(stripped));
    } catch {
      // Fall back: extract the first {...} block
      const match = stripped.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return this.validate(JSON.parse(match[0]));
        } catch {
          // fall through
        }
      }
      this.logger.warn('Could not extract valid JSON from LLM response');
      return NULL_PARSED_JOB;
    }
  }

  private validate(obj: unknown): ParsedJobDto {
    if (typeof obj !== 'object' || obj === null) return NULL_PARSED_JOB;
    const o = obj as Record<string, unknown>;
    return {
      summary: typeof o.summary === 'string' ? o.summary : null,
      salary: typeof o.salary === 'string' ? o.salary : null,
      responsibilities: this.toStringArray(o.responsibilities),
      requirements: this.toStringArray(o.requirements),
      benefits: this.toStringArray(o.benefits),
      tools: this.toStringArray(o.tools),
    };
  }

  private toStringArray(val: unknown): string[] | null {
    if (!Array.isArray(val)) return null;
    const filtered = val.filter((v): v is string => typeof v === 'string');
    return filtered.length > 0 ? filtered : null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
