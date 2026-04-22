import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Resume } from '../../generated/prisma/client.js';
import {
  CurrentUser,
  type JwtPayload,
} from '../auth/decorators/current-user.decorator.js';
import { JwtGuard } from '../auth/guards/jwt.guard.js';
import type { ParsedResume } from './interfaces/parsed-resume.interface.js';
import { ResumeService } from './resume.service.js';

@Controller('resume')
@UseGuards(JwtGuard)
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('resume', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          cb(new BadRequestException('Only PDF files are allowed'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ParsedResume> {
    if (!file) throw new BadRequestException('Resume file is required');
    return this.resumeService.upload(user.sub, file);
  }

  @Get()
  getResume(@CurrentUser() user: JwtPayload): Promise<Resume> {
    return this.resumeService.getResume(user.sub);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteResume(@CurrentUser() user: JwtPayload): Promise<void> {
    return this.resumeService.deleteResume(user.sub);
  }
}
