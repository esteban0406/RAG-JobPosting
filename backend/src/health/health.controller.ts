import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  HealthIndicatorStatus,
} from '@nestjs/terminus';
import { PrismaService } from '../storage/prisma.service.js';

@Controller('health')
export class HealthController {
  private readonly localEmbeddingUrl: string;

  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.localEmbeddingUrl = config.get<string>(
      'LOCAL_EMBEDDING_URL',
      'http://localhost:8000',
    );
  }

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.checkDatabase(),
      () => this.checkEmbeddingServer(),
    ]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    const key = 'database';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { [key]: { status: 'up' satisfies HealthIndicatorStatus } };
    } catch {
      return { [key]: { status: 'down' satisfies HealthIndicatorStatus } };
    }
  }

  private async checkEmbeddingServer(): Promise<HealthIndicatorResult> {
    const key = 'embedding';
    try {
      const res = await fetch(`${this.localEmbeddingUrl}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: ['health'], type: 'passage' }),
        signal: AbortSignal.timeout(5000),
      });
      const status: HealthIndicatorStatus = res.ok ? 'up' : 'down';
      return { [key]: { status } };
    } catch {
      return { [key]: { status: 'down' satisfies HealthIndicatorStatus } };
    }
  }
}
