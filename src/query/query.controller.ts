import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { SearchQueryDto } from './dto/search-query.dto.js';
import { QueryService } from './query.service.js';

@Controller('jobs')
@UseGuards(ThrottlerGuard)
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post('search')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  search(@Body() dto: SearchQueryDto) {
    return this.queryService.search(dto);
  }
}
