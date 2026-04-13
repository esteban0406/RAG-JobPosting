import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Job } from '../../generated/prisma/client.js';
import {
  CurrentUser,
  type JwtPayload,
} from '../auth/decorators/current-user.decorator.js';
import { JwtGuard } from '../auth/guards/jwt.guard.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import type { UserProfileDto } from './dto/user-profile.dto.js';
import { UserService } from './user.service.js';

@Controller('users')
@UseGuards(JwtGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  getProfile(@CurrentUser() user: JwtPayload): Promise<UserProfileDto> {
    return this.userService.getProfile(user.sub);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    return this.userService.updateProfile(user.sub, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAccount(@CurrentUser() user: JwtPayload): Promise<void> {
    return this.userService.deleteAccount(user.sub);
  }

  @Get('me/favorites')
  getFavorites(@CurrentUser() user: JwtPayload): Promise<Job[]> {
    return this.userService.getFavorites(user.sub);
  }

  @Post('me/favorites/:jobId')
  @HttpCode(HttpStatus.CREATED)
  saveFavorite(
    @CurrentUser() user: JwtPayload,
    @Param('jobId') jobId: string,
  ): Promise<void> {
    return this.userService.saveFavorite(user.sub, jobId);
  }

  @Delete('me/favorites/:jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFavorite(
    @CurrentUser() user: JwtPayload,
    @Param('jobId') jobId: string,
  ): Promise<void> {
    return this.userService.removeFavorite(user.sub, jobId);
  }
}
