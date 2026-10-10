import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { IngestionService } from './ingestion.service.js';

@Injectable()
export class IngestionScheduler {
  private readonly logger = new Logger(IngestionScheduler.name);
  private readonly cron: string;
  private readonly enabled: boolean;

  constructor(
    private readonly ingestionService: IngestionService,
    config: ConfigService,
  ) {
    this.cron = config.get<string>('INGESTION_CRON', '0 */6 * * *');
    this.enabled =
      config.get<string>('INGESTION_CRON_ENABLED', 'true') !== 'false';
  }

  @Cron('0 */6 * * *')
  async handleCron() {
    if (!this.enabled) {
      this.logger.debug(
        'Scheduled ingestion disabled (INGESTION_CRON_ENABLED=false)',
      );
      return;
    }
    this.logger.log(`Scheduled ingestion triggered (cron: ${this.cron})`);
    await this.ingestionService.run();
  }
}
