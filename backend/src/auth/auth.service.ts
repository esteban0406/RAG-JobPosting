import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  private readonly adminApiKey: string;

  constructor(
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    this.adminApiKey = config.getOrThrow<string>('ADMIN_API_KEY');
  }

  login(apiKey: string): { accessToken: string } {
    if (apiKey !== this.adminApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }
    const accessToken = this.jwtService.sign({ role: 'admin' });
    return { accessToken };
  }
}
