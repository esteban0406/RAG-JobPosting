import { Injectable } from '@nestjs/common';
import { SearchQueryDto } from './dto/search-query.dto.js';
import type { SearchResponseDto } from './dto/search-response.dto.js';
import { QueryOrchestratorService } from './query-orchestrator.service.js';

@Injectable()
export class QueryService {
  constructor(private readonly orchestrator: QueryOrchestratorService) {}

  async search(dto: SearchQueryDto): Promise<SearchResponseDto> {
    return this.orchestrator.handle(dto);
  }
}
