import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

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
  GEMINI_API_KEY: string;

  @IsString()
  @IsOptional()
  LOCAL_EMBEDDING_URL: string = 'http://localhost:8000';

  @IsString()
  @IsOptional()
  LLM_MODEL: string = 'gemini-3.1-flash-lite-preview';

  @IsString()
  @MinLength(16)
  JWT_SECRET: string;

  @IsString()
  @MinLength(8)
  ADMIN_API_KEY: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '24h';

  @IsString()
  @IsOptional()
  INGESTION_CRON: string = '0 */6 * * *';

  @IsNumber()
  @Min(1)
  @IsOptional()
  PORT: number = 3000;
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

  return validatedConfig;
}
