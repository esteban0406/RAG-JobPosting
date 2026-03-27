import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { IngestionService } from './ingestion.service.js';

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  async trigger() {
    const result = await this.ingestionService.run();
    return { message: 'Ingestion started', ...result };
  }
}
