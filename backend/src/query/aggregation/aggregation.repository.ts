import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client.js';
import { QUERY_TEMPLATES, type TemplateKey } from './query-templates.js';

@Injectable()
export class AggregationRepository implements OnModuleInit, OnModuleDestroy {
  private client!: PrismaClient;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const connectionString =
      this.config.get<string>('DATABASE_URL_READONLY') ??
      this.config.getOrThrow<string>('DATABASE_URL');
    const adapter = new PrismaPg({ connectionString });
    this.client = new PrismaClient({ adapter });
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  async execute(
    key: TemplateKey,
    params: string[] = [],
  ): Promise<Record<string, unknown>[]> {
    const sql = QUERY_TEMPLATES[key];
    if (!sql) {
      throw new BadRequestException(`Unknown aggregation template: ${key}`);
    }
    return this.client.$queryRawUnsafe(sql, ...params) as Promise<
      Record<string, unknown>[]
    >;
  }
}
