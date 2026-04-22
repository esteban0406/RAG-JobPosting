import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  CurrentUser,
  type JwtPayload,
} from '../auth/decorators/current-user.decorator.js';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard.js';
import { SearchQueryDto } from './dto/search-query.dto.js';
import { QueryService } from './query.service.js';

@Controller('jobs')
@UseGuards(ThrottlerGuard, OptionalJwtGuard)
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post('search')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  search(
    @Body() dto: SearchQueryDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.queryService.search(dto, user?.sub);
  }
}
