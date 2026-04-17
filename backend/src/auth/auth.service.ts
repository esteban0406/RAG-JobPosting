import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../storage/prisma.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { UserLoginDto } from './dto/user-login.dto.js';

@Injectable()
export class AuthService {
  private readonly adminApiKey: string;
  private readonly bcryptRounds: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.adminApiKey = config.getOrThrow<string>('ADMIN_API_KEY');
    this.bcryptRounds = config.get<number>('BCRYPT_ROUNDS', 10);
  }

  login(apiKey: string): { accessToken: string } {
    if (apiKey !== this.adminApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }
    const accessToken = this.jwtService.sign({ sub: 'admin', role: 'admin' });
    return { accessToken };
  }

  async register(dto: RegisterDto): Promise<{ accessToken: string }> {
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

    const accessToken = this.jwtService.sign({ sub: user.id, role: 'user' });
    return { accessToken };
  }

  async loginUser(dto: UserLoginDto): Promise<{ accessToken: string }> {
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

    const accessToken = this.jwtService.sign({ sub: user.id, role: 'user' });
    return { accessToken };
  }
}
