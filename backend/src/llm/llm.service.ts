import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 5_000;

export interface LlmOptions {
  temperature?: number;
  maxOutputTokens?: number;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly genai: GoogleGenAI;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.genai = new GoogleGenAI({
      apiKey: config.getOrThrow<string>('GEMINI_API_KEY'),
    });
    this.model = config.get<string>(
      'LLM_MODEL',
      'gemini-3.1-flash-lite-preview',
    );
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
      const result = await this.genai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          temperature: options.temperature ?? 0.2,
          maxOutputTokens: options.maxOutputTokens ?? 1024,
        },
      });

      const text = result.text ?? '';
      const usage = result.usageMetadata;
      this.logger.debug(
        `LLM complete (model=${this.model}, promptTokens=${usage?.promptTokenCount}, outputTokens=${usage?.candidatesTokenCount})`,
      );

      return text;
    } catch (err) {
      if (this.isModelNotFoundError(err)) {
        this.logger.error(`LLM model not found: ${this.model}`);
        throw new ServiceUnavailableException(
          `The AI model "${this.model}" is unavailable or does not exist.`,
        );
      }

      if (this.isQuotaError(err)) {
        if (this.isDailyQuotaExhausted(err)) {
          this.logger.error(
            `Gemini daily quota exhausted for model ${this.model}`,
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

      if (this.isTransientError(err) && attempt < MAX_RETRIES) {
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

  private isModelNotFoundError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('404') ||
      msg.includes('NOT_FOUND') ||
      msg.toLowerCase().includes('model not found') ||
      msg.toLowerCase().includes('not found')
    );
  }

  private isQuotaError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
  }

  private isDailyQuotaExhausted(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes('PerDay') || msg.includes('per_day');
  }

  private isTransientError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('500')
    );
  }

  private getRetryDelay(err: unknown, attempt: number): number {
    const msg = err instanceof Error ? err.message : String(err);
    const match = /Please retry in (\d+(?:\.\d+)?)s/.exec(msg);
    if (match) {
      return Math.ceil(parseFloat(match[1])) * 1000 + 1000;
    }
    const jitter = Math.random() * 1000;
    return RETRY_BASE_MS * Math.pow(2, attempt) + jitter;
  }

  async *completeStream(prompt: string): AsyncGenerator<string> {
    let stream: AsyncIterable<{ text?: string }>;

    try {
      stream = await this.genai.models.generateContentStream({
        model: this.model,
        contents: prompt,
        config: { temperature: 0.2, maxOutputTokens: 1024 },
      });
    } catch (err) {
      if (this.isModelNotFoundError(err)) {
        throw new ServiceUnavailableException(
          `The AI model "${this.model}" is unavailable or does not exist.`,
        );
      }
      if (this.isQuotaError(err)) {
        throw new HttpException(
          'The AI service is temporarily rate limited. Please try again in a moment.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new ServiceUnavailableException(
        'The AI service is temporarily unavailable.',
      );
    }

    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text;
    }
  }
}
