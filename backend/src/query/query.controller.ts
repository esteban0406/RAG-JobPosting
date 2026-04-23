import {
  Body,
  Controller,
  HttpException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  CurrentUser,
  type JwtPayload,
} from '../auth/decorators/current-user.decorator.js';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard.js';
import { SearchQueryDto } from './dto/search-query.dto.js';
import { QueryService } from './query.service.js';

@Controller('query')
@UseGuards(ThrottlerGuard, OptionalJwtGuard)
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  search(@Body() dto: SearchQueryDto, @CurrentUser() user?: JwtPayload) {
    return this.queryService.search(dto, user?.sub);
  }

  @Post('stream')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async searchStream(
    @Body() dto: SearchQueryDto,
    @Res() res: Response,
    @CurrentUser() user?: JwtPayload,
  ): Promise<void> {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const event of this.queryService.searchStream(
        dto,
        user?.sub,
      )) {
        res.write(JSON.stringify(event) + '\n');
      }
    } catch (err) {
      const status = err instanceof HttpException ? err.getStatus() : 500;
      const message =
        err instanceof HttpException
          ? ((err.getResponse() as { message?: string }).message ?? err.message)
          : 'Something went wrong. Please try again.';
      res.write(JSON.stringify({ type: 'error', status, message }) + '\n');
    } finally {
      res.end();
    }
  }
}
