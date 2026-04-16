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
- Extract ONLY specific named technologies, tools, platforms, frameworks, or software products.
- Good examples: "React", "Node.js", "PostgreSQL", "AWS", "Salesforce Marketing Cloud", "Azure DevOps", "GitHub Actions"

STRICT TOOL RULES:
- DO NOT include generic paradigms, techniques, industries, or concepts. Examples of things to EXCLUDE:
  - paradigms/techniques: "restful", "rag", "etl", "nosql", "ci/cd", "microservices", "accessibility"
  - industries/domains: "fintech", "govcon", "saas", "b2b"
  - vague platform categories: "cloud", "crm", "ai", "analytics", "containers", "agents"
  - partial/abbreviated names: "net" (use ".NET"), "node" (use "Node.js"), "react" (use "React")
- DO NOT include company names unless they are explicitly used as a software tool or platform in the job description.
- DEDUPLICATION: If a specific product name is already in the list (e.g. "Salesforce Marketing Cloud"), do NOT also add its parent brand as a separate entry (e.g. do NOT add "Salesforce" or "salesforce"). Keep only the most specific version. Apply this rule to all tool families (Azure, AWS, Google, Salesforce, Microsoft, etc.).

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
    // Explicit raw log for production troubleshooting with Groq responses
    console.error('Groq raw error response:', err);

    // Groq SDK wraps HTTP errors as APIError instances with a .status property
    const status = (err as { status?: number }).status;
    const message = (err as Error).message ?? '';

    if (status === 429) {
      if (this.isRpdExhausted(err)) {
        this.logger.error('Groq daily quota exhausted — aborting parse queue');
        throw new DailyQuotaExhaustedException();
      }

      // Per-minute rate limit (RPM or TPM) — retry up to 3 times
      if (attempt >= 3) {
        this.logger.warn('Groq rate limit: max retries reached');
        return NULL_PARSED_JOB;
      }

      const errorType = this.getErrorType(err); // "tokens" | "requests" | null
      const retryAfter =
        errorType === 'tokens'
          ? (this.getTokenResetSeconds(err) ??
            this.getRetryAfterSeconds(err) ??
            Math.pow(2, attempt) * 5)
          : (this.getRetryAfterSeconds(err) ?? Math.pow(2, attempt) * 5);

      this.logger.warn(
        `Groq rate limited (429, type=${errorType ?? 'unknown'}), retrying in ${retryAfter}s (attempt ${attempt + 1}/3)`,
      );
      await this.sleep(retryAfter * 1000);
      return this.parseWithGroq(text, attempt + 1);
    }

    // Any other error — log and return null parse
    this.logger.warn(`Groq parse error (${status ?? 'unknown'}): ${message}`);
    return NULL_PARSED_JOB;
  }

  // Returns true only for RPD (daily request quota) exhaustion.
  // TPM/RPM errors always have a short reset window and should be retried.
  private isRpdExhausted(err: unknown): boolean {
    const message = (err as Error).message ?? '';
    // Groq error body contains "per day" or "(RPD)" for daily quota errors
    if (
      message.toLowerCase().includes('per day') ||
      message.toLowerCase().includes('(rpd)')
    ) {
      return true;
    }
    // Belt-and-suspenders: remaining requests = 0 means daily quota is gone
    return this.getHeader(err, 'x-ratelimit-remaining-requests') === '0';
  }

  // Extracts the rate limit type ("tokens" or "requests") from the Groq error body
  private getErrorType(err: unknown): string | null {
    const type = (err as { error?: { error?: { type?: unknown } } }).error
      ?.error?.type;
    return typeof type === 'string' ? type : null;
  }

  // Parses x-ratelimit-reset-tokens header for TPM wait time (e.g. "32.299s", "1m30s")
  private getTokenResetSeconds(err: unknown): number | null {
    const value = this.getHeader(err, 'x-ratelimit-reset-tokens');
    return value ? this.parseGroqDuration(value) : null;
  }

  // Parses the retry-after header (plain seconds value from Groq)
  private getRetryAfterSeconds(err: unknown): number | null {
    const value = this.getHeader(err, 'retry-after');
    if (!value) return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }

  // Reads a response header from a Groq SDK error, handling both
  // Fetch API Headers objects (require .get()) and plain Record objects.
  private getHeader(err: unknown, name: string): string | null {
    const headers = (err as { headers?: unknown }).headers;
    if (!headers) return null;
    if (typeof (headers as { get?: unknown }).get === 'function') {
      return (headers as { get: (n: string) => string | null }).get(name);
    }
    return (headers as Record<string, string>)[name] ?? null;
  }

  // Parses Groq duration strings: "370ms", "9.77s", "1m30.5s", "1h55m12s"
  private parseGroqDuration(s: string): number {
    let total = 0;
    const h = s.match(/(\d+)h/);
    const m = s.match(/(\d+)m(?!s)/); // "m" not followed by "s" (avoid "ms")
    const sec = s.match(/([\d.]+)s/);
    const ms = s.match(/([\d.]+)ms/);
    if (h) total += parseInt(h[1]) * 3600;
    if (m) total += parseInt(m[1]) * 60;
    if (sec) total += parseFloat(sec[1]);
    if (ms) total += parseFloat(ms[1]) / 1000;
    return Math.ceil(total);
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
      tools: this.deduplicateTools(this.toStringArray(o.tools)),
    };
  }

  private toStringArray(val: unknown): string[] | null {
    if (!Array.isArray(val)) return null;
    const filtered = val.filter((v): v is string => typeof v === 'string');
    return filtered.length > 0 ? filtered : null;
  }

  /**
   * Removes tools that are a case-insensitive substring of another tool in
   * the same list. This catches model dedup failures like returning both
   * "Salesforce Marketing Cloud" and "salesforce" — the shorter one is dropped.
   */
  private deduplicateTools(tools: string[] | null): string[] | null {
    if (!tools) return null;
    const lower = tools.map((t) => t.toLowerCase());
    const kept = tools.filter((_, i) =>
      lower.every(
        (other, j) =>
          i === j ||
          !other.includes(lower[i]) ||
          other.length === lower[i].length,
      ),
    );
    return kept.length > 0 ? kept : null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
