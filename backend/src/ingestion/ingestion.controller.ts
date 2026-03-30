import {
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtGuard } from '../auth/guards/jwt.guard.js';
import { IngestionService } from './ingestion.service.js';

@Controller('ingestion')
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);

  constructor(private readonly ingestionService: IngestionService) {}

  @UseGuards(JwtGuard)
  @Post('trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  trigger() {
    // Run in background — embedding 1000+ jobs can take minutes
    this.ingestionService
      .run()
      .then((result) => {
        this.logger.log(
          `Ingestion complete — fetched=${result.fetched} stored=${result.stored} skipped=${result.skipped}`,
        );
      })
      .catch((err: Error) => {
        this.logger.error(`Ingestion failed: ${err.message}`);
      });

    return { message: 'Ingestion started' };
  }

  @Get('export')
  async export(@Res() res: Response) {
    const { csv, count } = await this.ingestionService.exportToCsv();
    const filename = `jobs_export_${new Date().toISOString().slice(0, 10)}.csv`;
    this.logger.log(`CSV export: ${count} jobs`);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
