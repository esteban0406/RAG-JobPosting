import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum VectorBackend {
  Pgvector = 'pgvector',
  Qdrant = 'qdrant',
}

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  @IsOptional()
  DATABASE_URL_READONLY: string;

  @IsString()
  @IsOptional()
  GEMINI_API_KEY: string;

  @IsString()
  @IsOptional()
  GEMINI_API_KEY2: string;

  @IsString()
  @IsOptional()
  LOCAL_EMBEDDING_URL: string = 'http://localhost:8000';

  // Must match the model the local embedding server reports; stored with
  // each chunk in JobChunk.embeddingModel.
  @IsString()
  @IsOptional()
  LOCAL_EMBEDDING_MODEL: string = 'multilingual-e5-base';

  @IsString()
  @IsOptional()
  LLM_MODEL: string = 'qwen/qwen3.8-27b';

  // Retries of the Groq SDK on 429/5xx; 0 in latency measurements.
  @IsNumber()
  @IsOptional()
  LLM_MAX_RETRIES: number = 2;

  @IsString()
  @IsOptional()
  RESUME_PARSER_MODEL: string = 'qwen/qwen3.8-27b';

  @IsString()
  @IsOptional()
  JOB_PARSER_MODEL: string = 'openai/gpt-oss-120b';

  @IsString()
  @MinLength(16)
  JWT_SECRET: string;

  @IsString()
  @MinLength(8)
  ADMIN_API_KEY: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '15m';

  @IsNumber()
  @Min(1)
  @IsOptional()
  REFRESH_TOKEN_TTL_DAYS: number = 30;

  @IsString()
  @IsOptional()
  INGESTION_CRON: string = '0 */6 * * *';

  @IsIn(['true', 'false'])
  @IsOptional()
  INGESTION_CRON_ENABLED: string = 'true';

  @IsNumber()
  @Min(1)
  @IsOptional()
  INGESTION_PARSE_CONCURRENCY: number = 1;

  @IsEnum(VectorBackend)
  @IsOptional()
  VECTOR_BACKEND: VectorBackend = VectorBackend.Pgvector;

  // Hybrid retrieval: BM25 fused with dense search by reciprocal rank fusion.
  @IsIn(['true', 'false'])
  @IsOptional()
  RETRIEVAL_HYBRID: string = 'true';

  // Cross-encoder reranking of the fused candidates (embedding server /rerank).
  @IsIn(['true', 'false'])
  @IsOptional()
  RERANK_ENABLED: string = 'true';

  // Defaults to LOCAL_EMBEDDING_URL, which serves /rerank as well.
  @IsString()
  @IsOptional()
  RERANKER_URL: string;

  // Reranker the server must serve (checked on every call); empty skips the
  // check. Chosen on the development set (Tesis/Desarollo/steps.md, 5b).
  @IsString()
  @IsOptional()
  RERANKER_MODEL: string = 'Qwen/Qwen3-Reranker-0.6B';

  // Fused candidates passed to the reranker (20 vs 30 chosen on the
  // development set: same nDCG@10, about 400 ms less).
  @IsNumber()
  @Min(1)
  @IsOptional()
  RERANK_CANDIDATES: number = 20;

  // Task instruction sent to instruction-aware rerankers (e.g. Qwen3-Reranker).
  @IsString()
  @IsOptional()
  RERANK_INSTRUCTION: string;

  // replace: rerank scores decide the order; rrf: fused with the first-stage
  // order by reciprocal rank fusion, so the reranker votes instead of decides.
  @IsIn(['replace', 'rrf'])
  @IsOptional()
  RERANK_FUSION: string = 'replace';

  // No-results gate on the best rerank probability of a query; unset disables
  // it. 0.134 was calibrated on the development set for Qwen3-Reranker-0.6B
  // (Tesis/Desarollo/steps.md, step 5b) and only applies to that model.
  @IsNumber()
  @IsOptional()
  RERANK_MIN_SCORE: number = 0.134;

  @IsString()
  @IsOptional()
  QDRANT_URL: string = 'http://localhost:6333';

  @IsString()
  @IsOptional()
  QDRANT_API_KEY: string;

  @IsString()
  @IsOptional()
  QDRANT_COLLECTION: string = 'job_chunks';

  @IsString()
  @IsOptional()
  FINDWORK_API_KEY: string;

  @IsString()
  @IsOptional()
  GROQ_API_KEY: string;

  @IsString()
  @IsOptional()
  GROQ_API_KEY2: string;

  @IsString()
  @IsOptional()
  OLLAMA_URL: string = 'http://localhost:11434';

  @IsString()
  @IsOptional()
  OLLAMA_MODEL: string = 'llama3.1:8b';

  @IsNumber()
  @Min(1)
  @IsOptional()
  PORT: number = 3000;

  @IsNumber()
  @Min(1)
  @IsOptional()
  BCRYPT_ROUNDS: number = 10;

  @IsString()
  @IsOptional()
  RESUME_UPLOAD_DIR: string = 'uploads/resumes';

  @IsString()
  @IsOptional()
  R2_ENDPOINT: string;

  @IsString()
  @IsOptional()
  R2_BUCKET_NAME: string;

  @IsString()
  @IsOptional()
  R2_ACCESS_KEY_ID: string;

  @IsString()
  @IsOptional()
  R2_SECRET_ACCESS_KEY: string;

  @IsNumber()
  @IsOptional()
  R2_PRESIGNED_URL_EXPIRY: number = 3600;

  // Read by src/instrument.ts before ConfigModule loads; unset disables
  // error reporting to Sentry.
  @IsString()
  @IsOptional()
  SENTRY_DSN: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  if (
    validatedConfig.NODE_ENV === Environment.Production &&
    !validatedConfig.GEMINI_API_KEY?.trim()
  ) {
    throw new Error('GEMINI_API_KEY is required in production');
  }

  if (
    validatedConfig.NODE_ENV === Environment.Production &&
    !validatedConfig.GROQ_API_KEY?.trim()
  ) {
    throw new Error('GROQ_API_KEY is required in production');
  }

  const missingR2 = [
    'R2_ENDPOINT',
    'R2_BUCKET_NAME',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ].filter((key) => !validatedConfig[key as keyof EnvironmentVariables]);
  if (validatedConfig.NODE_ENV === Environment.Production && missingR2.length) {
    throw new Error(`${missingR2.join(', ')} required in production`);
  }

  return validatedConfig;
}
