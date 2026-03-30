import { Injectable } from '@nestjs/common';
import { RagService } from '../rag/rag.service.js';
import { SearchQueryDto } from './dto/search-query.dto.js';
import type { SearchResponseDto } from './dto/search-response.dto.js';

@Injectable()
export class QueryService {
  constructor(private readonly ragService: RagService) {}

  async search(dto: SearchQueryDto): Promise<SearchResponseDto> {
    return this.ragService.query(dto.query, {
      location: dto.location,
      jobType: dto.type,
    });
  }
}
