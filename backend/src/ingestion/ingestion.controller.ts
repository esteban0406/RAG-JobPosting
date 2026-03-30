import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
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
}
