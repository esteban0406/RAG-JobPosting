import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import type { Cache } from 'cache-manager';
import { createHash } from 'crypto';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BATCH_DELAY_MS = 2000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 10_000;

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly genai: GoogleGenAI;

  constructor(
    config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    this.genai = new GoogleGenAI({
      apiKey: config.getOrThrow<string>('GEMINI_API_KEY'),
    });
  }

  async embed(text: string): Promise<number[]> {
    const cacheKey = `embed:${createHash('sha256').update(text).digest('hex')}`;
    const cached = await this.cache.get<number[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for embedding (model=${EMBEDDING_MODEL})`);
      return cached;
    }

    const vector = await this.embedWithRetry(text);

    this.logger.debug(
      `Embedded text (model=${EMBEDDING_MODEL}, dims=${EMBEDDING_DIMENSIONS})`,
    );
    await this.cache.set(cacheKey, vector, CACHE_TTL_MS);
    return vector;
  }

  private async embedWithRetry(text: string, attempt = 0): Promise<number[]> {
    try {
      const result = await this.genai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      });

      const vector = result.embeddings?.[0]?.values;
      if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Unexpected embedding dimensions: got ${vector?.length}, expected ${EMBEDDING_DIMENSIONS}`,
        );
      }

      return vector;
    } catch (err) {
      if (err instanceof HttpException) throw err;

      if (this.isQuotaError(err)) {
        if (this.isDailyQuotaExhausted(err)) {
          this.logger.error(`Gemini daily embedding quota exhausted`);
          throw new ServiceUnavailableException(
            'The embedding service has reached its daily request limit. Please try again tomorrow.',
          );
        }

        if (attempt < MAX_RETRIES) {
          const jitter = Math.random() * 2000;
          const delay = RETRY_BASE_MS * Math.pow(2, attempt) + jitter;
          this.logger.warn(
            `Embedding rate limited, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.embedWithRetry(text, attempt + 1);
        }

        this.logger.error(
          `Embedding rate limit exceeded after ${MAX_RETRIES} retries`,
        );
        throw new HttpException(
          'The embedding service is temporarily rate limited. Please try again in a moment.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw err;
    }
  }

  private isQuotaError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
  }

  private isDailyQuotaExhausted(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes('PerDay') || msg.includes('per_day');
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
    return results;
  }
}
