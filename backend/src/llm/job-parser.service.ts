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
  "skills": string[] | null
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

SKILLS:
- Extract ALL skills that a qualified candidate would list on their resume or LinkedIn profile.
- Capture both categories:
  (a) Named software, tools, platforms, and technologies
      ✓ "React", "AWS", "PostgreSQL", "Figma", "Salesforce Marketing Cloud", "GitHub Actions"
  (b) Professional competencies, methodologies, and domain expertise
      ✓ "A/B testing", "stakeholder management", "SEO", "content strategy", "agile",
         "product roadmapping", "user research", "CI/CD", "ETL pipelines", "fraud detection",
         "lifecycle marketing", "financial modeling", "supply chain management"

STRICT SKILLS RULES:
1. RESUME TEST — Only include terms a professional would explicitly claim as a skill.
   Ask: "Would a recruiter meaningfully filter candidates on this term?" If not, exclude it.
2. EXCLUDE generic soft skills: "communication", "teamwork", "leadership", "passion",
   "problem-solving", "attention to detail", "innovative thinking", "fast learner"
3. EXCLUDE pure industry or business model labels: "fintech", "saas", "b2b", "enterprise",
   "govcon", "e-commerce" — these describe context, not ability.
4. EXCLUDE vague capability categories: "cloud", "ai", "data", "analytics", "automation",
   "mobile", "security" — too broad; include the specific technology or specialization instead.
5. INCLUDE specific methodologies and techniques when named as requirements:
   "agile", "scrum", "kanban", "CI/CD", "SEO", "A/B testing", "test-driven development",
   "root cause analysis", "data modeling", "sprint planning", "OKRs"
6. CANONICAL NAMES — Always use the standard, correctly capitalised name:
   "Node.js" not "node", "React" not "react", ".NET" not "net",
   "TypeScript" not "typescript", "PostgreSQL" not "postgres", "Kubernetes" not "k8s".
   Never include both a full name and its abbreviated or lowercase variant in the same list.
7. DEDUPLICATION — Keep only the most specific version. If "Salesforce Marketing Cloud"
   is present, do NOT also add "Salesforce". Apply to all product families.
8. CONCISENESS — Each entry must be a concise noun phrase of 1–6 words with NO parenthetical content.
   Two patterns to handle:
   (a) Parenthetical lists named items → split into separate entries, drop the wrapper label:
       ✗ "ORMs (e.g., SQLAlchemy, Django ORM)"          → ✓ "SQLAlchemy", "Django ORM"
       ✗ "AI tools (ChatGPT, Midjourney)"               → ✓ "ChatGPT", "Midjourney"
       ✗ "LLMs (OpenAI, Anthropic)"                     → ✓ "OpenAI API", "Anthropic API"
   (b) Parenthetical explains or abbreviates the main term → keep the main term only, drop the parenthetical:
       ✗ "RBAC (Role-Based Access Control)"             → ✓ "RBAC"
       ✗ "Azure DevOps (ADO)"                           → ✓ "Azure DevOps"
       ✗ "Microsoft Dynamics 365 (Sales module)"        → ✓ "Microsoft Dynamics 365"
   Never write explanatory clauses or full sentences as a single entry:
       ✗ "Analytical ability and comfort with performance measurement: cohort retention..." → ✓ "cohort analysis"
       ✗ "Experience designing for B2B SaaS dashboards as well as consumer-facing interfaces" → ✓ "dashboard design"

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

  constructor(config: ConfigService) {
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
          response_format: { type: 'json_object' },
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
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_completion_tokens: 1500,
        stream: false,
        response_format: { type: 'json_object' },
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
        this.getRetryAfterSeconds(err) ??
        this.getTokenResetSeconds(err) ??
        Math.pow(2, attempt) * 5;

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
    const stripped = raw
      .trim()
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/```/g, '');

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
      this.logger.warn(
        `Could not extract valid JSON from LLM response. Raw (first 300 chars): ${raw.slice(0, 300)}`,
      );
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
      skills: this.deduplicateSkills(this.toStringArray(o.skills)),
    };
  }

  private toStringArray(val: unknown): string[] | null {
    if (!Array.isArray(val)) return null;
    const filtered = val.filter((v): v is string => typeof v === 'string');
    return filtered.length > 0 ? filtered : null;
  }

  /**
   * Removes skills that are a case-insensitive substring of another skill in
   * the same list. This catches model dedup failures like returning both
   * "Salesforce Marketing Cloud" and "salesforce" — the shorter one is dropped.
   */
  private deduplicateSkills(skills: string[] | null): string[] | null {
    if (!skills) return null;
    const lower = skills.map((t) => t.toLowerCase());
    const kept = skills.filter((_, i) =>
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
