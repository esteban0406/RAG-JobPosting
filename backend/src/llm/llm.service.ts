import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 5_000;

export interface LlmOptions {
  temperature?: number;
  maxOutputTokens?: number;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly groqClients: Groq[];
  private llmClientIdx = 0;
  private readonly model: string;

  constructor(config: ConfigService) {
    const keys = [
      config.get<string>('GROQ_API_KEY'),
      config.get<string>('GROQ_API_KEY_2'),
    ].filter(Boolean) as string[];
    if (keys.length === 0) throw new Error('GROQ_API_KEY is required');
    this.groqClients = keys.map((apiKey) => new Groq({ apiKey }));
    this.model = config.get<string>('LLM_MODEL', 'qwen/qwen3-32b');
  }

  private get currentClient(): Groq {
    return this.groqClients[this.llmClientIdx];
  }

  async complete(prompt: string, options: LlmOptions = {}): Promise<string> {
    return this.completeWithRetry(prompt, options);
  }

  private async completeWithRetry(
    prompt: string,
    options: LlmOptions,
    attempt = 0,
  ): Promise<string> {
    try {
      const completion = await this.currentClient.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: options.temperature ?? 0.2,
        max_completion_tokens: options.maxOutputTokens ?? 1024,
      });

      const raw = completion.choices[0]?.message?.content ?? '';
      const text = this.stripThinking(raw);
      const usage = completion.usage;
      this.logger.debug(
        `LLM complete (model=${this.model}, promptTokens=${usage?.prompt_tokens}, outputTokens=${usage?.completion_tokens})`,
      );

      return text;
    } catch (err) {
      const status = (err as { status?: number }).status;

      if (status === 404) {
        this.logger.error(`LLM model not found: ${this.model}`);
        throw new ServiceUnavailableException(
          `The AI model "${this.model}" is unavailable or does not exist.`,
        );
      }

      if (status === 429) {
        if (this.isDailyQuotaExhausted(err)) {
          if (this.llmClientIdx < this.groqClients.length - 1) {
            this.llmClientIdx++;
            this.logger.warn(
              `Groq LLM daily quota exhausted — rotating to key ${this.llmClientIdx + 1}`,
            );
            return this.completeWithRetry(prompt, options, 0);
          }
          this.logger.error(
            `Groq daily quota exhausted on all keys for model ${this.model}`,
          );
          throw new ServiceUnavailableException(
            'The AI service has reached its daily request limit. Please try again tomorrow.',
          );
        }

        if (attempt < MAX_RETRIES) {
          const delay = this.getRetryDelay(err, attempt);
          this.logger.warn(
            `LLM rate limited (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${Math.round(delay / 1000)}s`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.completeWithRetry(prompt, options, attempt + 1);
        }

        this.logger.error(
          `LLM rate limit exceeded after ${MAX_RETRIES} retries`,
        );
        throw new HttpException(
          'The AI service is temporarily rate limited. Please try again in a moment.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      if ((status === 500 || status === 503) && attempt < MAX_RETRIES) {
        const delay = this.getRetryDelay(err, attempt);
        this.logger.warn(
          `LLM request failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${Math.round(delay / 1000)}s`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.completeWithRetry(prompt, options, attempt + 1);
      }

      this.logger.error(`LLM request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'The AI service is temporarily unavailable.',
      );
    }
  }

  private isDailyQuotaExhausted(err: unknown): boolean {
    const msg = (err as Error).message ?? '';
    return (
      msg.toLowerCase().includes('per day') ||
      msg.toLowerCase().includes('(rpd)')
    );
  }

  private getRetryDelay(err: unknown, attempt: number): number {
    const retryAfter = this.getHeader(err, 'retry-after');
    if (retryAfter) {
      const parsed = parseFloat(retryAfter);
      if (!isNaN(parsed)) return parsed * 1000 + 500;
    }
    const jitter = Math.random() * 1000;
    return RETRY_BASE_MS * Math.pow(2, attempt) + jitter;
  }

  private getHeader(err: unknown, name: string): string | null {
    const headers = (err as { headers?: unknown }).headers;
    if (!headers) return null;
    if (typeof (headers as { get?: unknown }).get === 'function') {
      return (headers as { get: (n: string) => string | null }).get(name);
    }
    return (headers as Record<string, string>)[name] ?? null;
  }

  async *completeStream(prompt: string): AsyncGenerator<string> {
    try {
      const stream = await this.currentClient.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        temperature: 0.2,
        max_completion_tokens: 1024,
      });

      yield* this.streamWithoutThinking(stream);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        throw new ServiceUnavailableException(
          `The AI model "${this.model}" is unavailable or does not exist.`,
        );
      }
      if (status === 429) {
        throw new HttpException(
          'The AI service is temporarily rate limited. Please try again in a moment.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new ServiceUnavailableException(
        'The AI service is temporarily unavailable.',
      );
    }
  }

  private stripThinking(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>\n*/g, '').trim();
  }

  private async *streamWithoutThinking(
    stream: AsyncIterable<{
      choices: Array<{ delta?: { content?: string | null } }>;
    }>,
  ): AsyncGenerator<string> {
    const OPEN = '<think>';
    const CLOSE = '</think>';
    let buf = '';
    let thinking = false;

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (!text) continue;
      buf += text;

      while (buf.length > 0) {
        if (thinking) {
          const closeIdx = buf.indexOf(CLOSE);
          if (closeIdx !== -1) {
            thinking = false;
            buf = buf.slice(closeIdx + CLOSE.length).replace(/^\n+/, '');
          } else {
            buf = buf.slice(Math.max(0, buf.length - CLOSE.length + 1));
            break;
          }
        } else {
          const openIdx = buf.indexOf(OPEN);
          if (openIdx !== -1) {
            if (openIdx > 0) yield buf.slice(0, openIdx);
            thinking = true;
            buf = buf.slice(openIdx + OPEN.length);
          } else {
            const keep = OPEN.length - 1;
            if (buf.length > keep) {
              yield buf.slice(0, buf.length - keep);
              buf = buf.slice(buf.length - keep);
            }
            break;
          }
        }
      }
    }

    if (!thinking && buf.length > 0) yield buf;
  }
}
