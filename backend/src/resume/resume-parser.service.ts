import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import {
  NULL_PARSED_RESUME,
  type Education,
  type ParsedResume,
  type WorkExperience,
} from './interfaces/parsed-resume.interface.js';

const SYSTEM_PROMPT = `You are a strict information extraction system for resumes and CVs.

Your task is to extract structured data from the resume text provided by the user.

Return ONLY a valid JSON object with EXACTLY these keys:
{
  "name": string | null,
  "email": string | null,
  "linkedin": string | null,
  "phone": string | null,
  "location": string | null,
  "summary": string | null,
  "skills": string[],
  "experience": [
    {
      "company": string,
      "title": string,
      "startDate": string | null,
      "endDate": string | null,
      "description": string
    }
  ],
  "education": [
    {
      "institution": string,
      "degree": string | null,
      "field": string | null,
      "graduationYear": string | null
    }
  ],
  "certifications": string[]
}

-----------------------
EXTRACTION RULES
-----------------------

GENERAL:
- Extract information exactly as written. Do NOT rewrite or fabricate missing data.
- If a field is not present, return null or an empty array.
- Use null for optional scalar fields that are absent.
- Use [] for arrays with no items.

NAME: Full name of the candidate.

EMAIL: Primary email address.

LINKEDIN: LinkedIn profile URL or handle. Return null if not present.

PHONE: Phone number as written.

LOCATION: City, state, country or general location. Return null if not present.

SUMMARY:
- 2–3 sentence professional overview derived from a summary or objective section.
- If no summary section exists, derive one from the overall profile.

SKILLS:
- Extract ALL skills a professional would list on a resume or LinkedIn profile.
- Include named technologies, tools, platforms, frameworks, methodologies, and domain expertise.
- CANONICAL NAMES: Use standard capitalisation — "TypeScript" not "typescript", "Node.js" not "node", "React" not "react".
- DEDUPLICATION: Keep only the most specific version. If "Salesforce Marketing Cloud" is present, do NOT also add "Salesforce".
- EXCLUDE generic soft skills: "communication", "teamwork", "leadership", "fast learner".
- Each entry must be a concise noun phrase of 1–6 words.

EXPERIENCE:
- Extract ALL work experience entries.
- company: Employer name.
- title: Job title.
- startDate / endDate: As written (e.g. "Jan 2021", "2020", "Present"). Return null if not present.
- description: 1–3 sentence summary of responsibilities and achievements for that role.

EDUCATION:
- Extract ALL education entries.
- institution: School or university name.
- degree: e.g. "Bachelor of Science", "Master's", "PhD". Return null if not present.
- field: e.g. "Computer Science", "Business Administration". Return null if not present.
- graduationYear: Year as string (e.g. "2019"). Return null if not present.

CERTIFICATIONS:
- List of certification names only (e.g. "AWS Certified Solutions Architect", "PMP").
- Return [] if none.

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
export class ResumeParserService {
  private readonly logger = new Logger(ResumeParserService.name);
  private readonly isDev: boolean;
  private readonly ollamaUrl: string;
  private readonly ollamaModel: string;
  private readonly groqClients: Groq[] = [];
  private resumeClientIdx = 0;

  constructor(config: ConfigService) {
    this.isDev = config.get<string>('NODE_ENV') !== 'production';
    this.ollamaUrl = `${config.get<string>('OLLAMA_URL') ?? 'http://localhost:11434'}/v1/chat/completions`;
    this.ollamaModel = config.get<string>('OLLAMA_MODEL') ?? 'llama3.1:8b';

    if (!this.isDev) {
      const keys = [
        config.get<string>('GROQ_API_KEY'),
        config.get<string>('GROQ_API_KEY2'),
      ].filter(Boolean) as string[];
      if (keys.length === 0)
        throw new Error('GROQ_API_KEY is required in production');
      this.groqClients = keys.map((apiKey) => new Groq({ apiKey }));
    }
  }

  async parse(text: string): Promise<ParsedResume> {
    if (this.isDev) {
      return this.parseWithOllama(text);
    }
    return this.parseWithGroq(text);
  }

  // ── Ollama (dev) ──────────────────────────────────────────────────────────

  private async parseWithOllama(text: string): Promise<ParsedResume> {
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
        return NULL_PARSED_RESUME;
      }

      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content ?? '';
      return this.extractJson(content);
    } catch (err) {
      this.logger.warn(`Ollama parse error: ${(err as Error).message}`);
      return NULL_PARSED_RESUME;
    }
  }

  // ── Groq (prod) ───────────────────────────────────────────────────────────

  private async parseWithGroq(
    text: string,
    attempt = 0,
  ): Promise<ParsedResume> {
    try {
      const completion = await this.groqClients[
        this.resumeClientIdx
      ].chat.completions.create({
        model: 'qwen/qwen3-32b',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_completion_tokens: 4096,
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
  ): Promise<ParsedResume> {
    const status = (err as { status?: number }).status;
    const message = (err as Error).message ?? '';

    if (status === 429) {
      if (this.isRpdExhausted(err)) {
        if (this.resumeClientIdx < this.groqClients.length - 1) {
          this.resumeClientIdx++;
          this.logger.warn(
            `Groq daily quota exhausted — rotating to key ${this.resumeClientIdx + 1}`,
          );
          return this.parseWithGroq(text, 0);
        }
        this.logger.error(
          'Groq daily quota exhausted on all keys — aborting resume parse',
        );
        throw new DailyQuotaExhaustedException();
      }

      if (attempt >= 3) {
        this.logger.warn('Groq rate limit: max retries reached');
        return NULL_PARSED_RESUME;
      }

      const errorType = this.getErrorType(err);
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

    this.logger.warn(`Groq parse error (${status ?? 'unknown'}): ${message}`);
    return NULL_PARSED_RESUME;
  }

  private isRpdExhausted(err: unknown): boolean {
    const message = (err as Error).message ?? '';
    if (
      message.toLowerCase().includes('per day') ||
      message.toLowerCase().includes('(rpd)')
    ) {
      return true;
    }
    return this.getHeader(err, 'x-ratelimit-remaining-requests') === '0';
  }

  private getErrorType(err: unknown): string | null {
    const type = (err as { error?: { error?: { type?: unknown } } }).error
      ?.error?.type;
    return typeof type === 'string' ? type : null;
  }

  private getTokenResetSeconds(err: unknown): number | null {
    const value = this.getHeader(err, 'x-ratelimit-reset-tokens');
    return value ? this.parseGroqDuration(value) : null;
  }

  private getRetryAfterSeconds(err: unknown): number | null {
    const value = this.getHeader(err, 'retry-after');
    if (!value) return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }

  private getHeader(err: unknown, name: string): string | null {
    const headers = (err as { headers?: unknown }).headers;
    if (!headers) return null;
    if (typeof (headers as { get?: unknown }).get === 'function') {
      return (headers as { get: (n: string) => string | null }).get(name);
    }
    return (headers as Record<string, string>)[name] ?? null;
  }

  private parseGroqDuration(s: string): number {
    let total = 0;
    const h = s.match(/(\d+)h/);
    const m = s.match(/(\d+)m(?!s)/);
    const sec = s.match(/([\d.]+)s/);
    const ms = s.match(/([\d.]+)ms/);
    if (h) total += parseInt(h[1]) * 3600;
    if (m) total += parseInt(m[1]) * 60;
    if (sec) total += parseFloat(sec[1]);
    if (ms) total += parseFloat(ms[1]) / 1000;
    return Math.ceil(total);
  }

  // ── JSON extraction ───────────────────────────────────────────────────────

  private extractJson(raw: string): ParsedResume {
    const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');

    try {
      return this.validate(JSON.parse(stripped));
    } catch {
      const match = stripped.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return this.validate(JSON.parse(match[0]));
        } catch {
          // fall through
        }
      }
      this.logger.warn('Could not extract valid JSON from LLM response');
      return NULL_PARSED_RESUME;
    }
  }

  private validate(obj: unknown): ParsedResume {
    if (typeof obj !== 'object' || obj === null) return NULL_PARSED_RESUME;
    const o = obj as Record<string, unknown>;

    return {
      name: typeof o.name === 'string' ? o.name : null,
      email: typeof o.email === 'string' ? o.email : null,
      linkedin: typeof o.linkedin === 'string' ? o.linkedin : null,
      phone: typeof o.phone === 'string' ? o.phone : null,
      location: typeof o.location === 'string' ? o.location : null,
      summary: typeof o.summary === 'string' ? o.summary : null,
      skills: this.toStringArray(o.skills) ?? [],
      experience: this.toExperienceArray(o.experience),
      education: this.toEducationArray(o.education),
      certifications: this.toStringArray(o.certifications) ?? [],
    };
  }

  private toStringArray(val: unknown): string[] | null {
    if (!Array.isArray(val)) return null;
    const filtered = val.filter((v): v is string => typeof v === 'string');
    return filtered.length > 0 ? filtered : null;
  }

  private toExperienceArray(val: unknown): WorkExperience[] {
    if (!Array.isArray(val)) return [];
    return val
      .filter((v) => typeof v === 'object' && v !== null)
      .map((v) => {
        const e = v as Record<string, unknown>;
        return {
          company: typeof e.company === 'string' ? e.company : '',
          title: typeof e.title === 'string' ? e.title : '',
          startDate: typeof e.startDate === 'string' ? e.startDate : null,
          endDate: typeof e.endDate === 'string' ? e.endDate : null,
          description: typeof e.description === 'string' ? e.description : '',
        };
      })
      .filter((e) => e.company || e.title);
  }

  private toEducationArray(val: unknown): Education[] {
    if (!Array.isArray(val)) return [];
    return val
      .filter((v) => typeof v === 'object' && v !== null)
      .map((v) => {
        const e = v as Record<string, unknown>;
        return {
          institution: typeof e.institution === 'string' ? e.institution : '',
          degree: typeof e.degree === 'string' ? e.degree : null,
          field: typeof e.field === 'string' ? e.field : null,
          graduationYear:
            typeof e.graduationYear === 'string' ? e.graduationYear : null,
        };
      })
      .filter((e) => e.institution);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
