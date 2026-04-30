import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { StorageModule } from '../storage/storage.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { RolesGuard } from './guards/roles.guard.js';
import { JwtGuard } from './guards/jwt.guard.js';
import { OptionalJwtGuard } from './guards/optional-jwt.guard.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN', '24h'),
        },
      }),
    }),
    StorageModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtGuard, RolesGuard, OptionalJwtGuard],
  exports: [JwtGuard, RolesGuard, OptionalJwtGuard, JwtModule],
})
export class AuthModule {}
