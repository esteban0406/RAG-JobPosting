import { Injectable, NotFoundException } from '@nestjs/common';
import type { Job, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../storage/prisma.service.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { resume: { select: { id: true } } },
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  update(id: string, data: UpdateProfileDto): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }

  async addFavorite(userId: string, jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    await this.prisma.userFavorite.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: { userId, jobId },
      update: {},
    });
  }

  async removeFavorite(userId: string, jobId: string): Promise<void> {
    await this.prisma.userFavorite.deleteMany({
      where: { userId, jobId },
    });
  }

  async getFavorites(userId: string): Promise<Job[]> {
    const favorites = await this.prisma.userFavorite.findMany({
      where: { userId },
      include: { job: true },
      orderBy: { savedAt: 'desc' },
    });
    return favorites.map((f) => f.job);
  }
}
