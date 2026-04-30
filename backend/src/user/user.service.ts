import { Injectable, NotFoundException } from '@nestjs/common';
import type { Job } from '../../generated/prisma/client.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
import type { UserProfileDto } from './dto/user-profile.dto.js';
import { UserRepository } from './user.repository.js';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, resume, ...rest } = user;
    return { ...rest, hasResume: resume !== null };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const updated = await this.userRepository.update(userId, dto);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...rest } = updated;
    return { ...rest, hasResume: user.resume !== null };
  }

  async deleteAccount(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.userRepository.delete(userId);
  }

  saveFavorite(userId: string, jobId: string): Promise<void> {
    return this.userRepository.addFavorite(userId, jobId);
  }

  removeFavorite(userId: string, jobId: string): Promise<void> {
    return this.userRepository.removeFavorite(userId, jobId);
  }

  getFavorites(userId: string): Promise<Job[]> {
    return this.userRepository.getFavorites(userId);
  }
}
