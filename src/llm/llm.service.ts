import { Injectable, Logger } from '@nestjs/common';
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
    this.model = config.get<string>('LLM_MODEL', 'gemini-2.0-flash');
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
      if (this.isTransientError(err) && attempt < MAX_RETRIES) {
        const delay = this.getRetryDelay(err, attempt);
        this.logger.warn(
          `LLM request failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${Math.round(delay / 1000)}s`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.completeWithRetry(prompt, options, attempt + 1);
      }
      throw err;
    }
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
    const stream = await this.genai.models.generateContentStream({
      model: this.model,
      contents: prompt,
      config: { temperature: 0.2 },
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  }

  private isTransientError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('429') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('503') ||
      msg.includes('UNAVAILABLE') ||
      msg.includes('500')
    );
  }
}
