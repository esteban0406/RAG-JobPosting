import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { IngestionService } from './ingestion.service.js';

@Injectable()
export class IngestionScheduler {
  private readonly logger = new Logger(IngestionScheduler.name);
  private readonly cron: string;

  constructor(
    private readonly ingestionService: IngestionService,
    config: ConfigService,
  ) {
    this.cron = config.get<string>('INGESTION_CRON', '0 */6 * * *');
  }

  @Cron('0 */6 * * *')
  async handleCron() {
    this.logger.log(`Scheduled ingestion triggered (cron: ${this.cron})`);
    await this.ingestionService.run();
  }
}
