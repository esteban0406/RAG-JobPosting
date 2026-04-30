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

const GEMINI_MODEL_NAME = 'gemini-embedding-001';
const LOCAL_MODEL_NAME = 'e5-base-v2';
const EMBEDDING_DIMENSIONS = 768;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BATCH_DELAY_MS = 2000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 10_000;

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  readonly provider: 'local' | 'gemini';
  private readonly genaiClients: GoogleGenAI[] = [];
  private embedClientIdx = 0;
  private readonly localEmbeddingUrl: string;

  constructor(
    config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    const isProduction = config.get<string>('NODE_ENV') === 'production';
    this.provider = isProduction ? 'gemini' : 'local';
    this.localEmbeddingUrl = config.get<string>(
      'LOCAL_EMBEDDING_URL',
      'http://localhost:8000',
    );

    if (this.provider === 'gemini') {
      const keys = [
        config.getOrThrow<string>('GEMINI_API_KEY'),
        config.get<string>('GEMINI_API_KEY_2'),
      ].filter(Boolean) as string[];
      this.genaiClients = keys.map((apiKey) => new GoogleGenAI({ apiKey }));
    }

    this.logger.log(
      `Embedding provider: ${this.provider} (${this.genaiClients.length} key(s))`,
    );
  }

  private get currentGenai(): GoogleGenAI {
    return this.genaiClients[this.embedClientIdx];
  }

  get modelName(): string {
    return this.provider === 'gemini' ? GEMINI_MODEL_NAME : LOCAL_MODEL_NAME;
  }

  async embed(text: string): Promise<number[]> {
    const cacheKey = `embed:${createHash('sha256').update(text).digest('hex')}`;
    const cached = await this.cache.get<number[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for embedding (model=${this.modelName})`);
      return cached;
    }

    const vector =
      this.provider === 'gemini'
        ? await this.embedWithGemini(text)
        : await this.embedWithLocal(text);

    this.logger.debug(
      `Embedded text (model=${this.modelName}, dims=${EMBEDDING_DIMENSIONS})`,
    );
    await this.cache.set(cacheKey, vector, CACHE_TTL_MS);
    return vector;
  }

  async embedQuery(text: string): Promise<number[]> {
    if (this.provider === 'local') {
      return this.embedWithLocal(text, 'query');
    }
    return this.embed(text);
  }

  private async embedWithLocal(
    text: string,
    type: 'query' | 'passage' = 'passage',
  ): Promise<number[]> {
    const response = await fetch(`${this.localEmbeddingUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: [text], type }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Local embedding server returned ${response.status}`,
      );
    }

    const data = (await response.json()) as { embeddings: number[][] };
    const vector = data.embeddings?.[0];

    if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Unexpected embedding dimensions from local server: got ${vector?.length}, expected ${EMBEDDING_DIMENSIONS}`,
      );
    }

    return vector;
  }

  private async embedWithGemini(text: string, attempt = 0): Promise<number[]> {
    try {
      const result = await this.currentGenai.models.embedContent({
        model: GEMINI_MODEL_NAME,
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
          if (this.embedClientIdx < this.genaiClients.length - 1) {
            this.embedClientIdx++;
            this.logger.warn(
              `Gemini embedding daily quota exhausted — rotating to key ${this.embedClientIdx + 1}`,
            );
            return this.embedWithGemini(text, 0);
          }
          this.logger.error(
            'Gemini embedding daily quota exhausted on all keys',
          );
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
          return this.embedWithGemini(text, attempt + 1);
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
      if (this.provider === 'gemini') {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
    return results;
  }
}
