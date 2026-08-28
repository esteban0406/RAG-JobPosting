import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../storage/prisma.service.js';
import { RefreshTokenRepository } from './refresh-token.repository.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { UserLoginDto } from './dto/user-login.dto.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly adminApiKey: string;
  private readonly bcryptRounds: number;
  private readonly refreshTokenTtlDays: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    config: ConfigService,
  ) {
    this.adminApiKey = config.getOrThrow<string>('ADMIN_API_KEY');
    this.bcryptRounds = config.get<number>('BCRYPT_ROUNDS', 10);
    this.refreshTokenTtlDays = config.get<number>('REFRESH_TOKEN_TTL_DAYS', 30);
  }

  login(apiKey: string): { accessToken: string } {
    if (apiKey !== this.adminApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }
    const accessToken = this.jwtService.sign({ sub: 'admin', role: 'admin' });
    return { accessToken };
  }

  async register(dto: RegisterDto): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        skills: dto.skills ?? [],
        preferredFields: dto.preferredFields ?? [],
        location: dto.location,
      },
    });

    return this.issueTokenPair(user.id);
  }

  async loginUser(dto: UserLoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokenPair(user.id);
  }

  async refresh(rawToken: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.refreshTokenRepo.findByHash(tokenHash);
    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (existing.revokedAt) {
      // Reuse of an already-rotated token is a signal of theft — kill the whole session family.
      await this.refreshTokenRepo.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    await this.refreshTokenRepo.revoke(existing.id);
    return this.issueTokenPair(existing.userId, existing.familyId);
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.refreshTokenRepo.findByHash(tokenHash);
    if (existing) {
      await this.refreshTokenRepo.revoke(existing.id);
    }
  }

  private async issueTokenPair(
    userId: string,
    familyId: string = randomUUID(),
  ): Promise<TokenPair> {
    const accessToken = this.jwtService.sign({ sub: userId, role: 'user' });

    const raw = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );
    await this.refreshTokenRepo.create({
      userId,
      tokenHash: this.hashToken(raw),
      familyId,
      expiresAt,
    });

    return { accessToken, refreshToken: raw };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
