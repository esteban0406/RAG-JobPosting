import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtPayload } from '../decorators/current-user.decorator.js';

/**
 * Verifies the Authorization header on `request`, sets `request.user`, and
 * returns the payload — or throws. Shared by JwtGuard and RolesGuard so a
 * route can rely on RolesGuard alone without depending on guard ordering.
 */
export function verifyRequestToken(
  request: Request & { user?: JwtPayload },
  jwtService: JwtService,
): JwtPayload {
  const authHeader = request.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (!token) {
    throw new UnauthorizedException();
  }
  try {
    const payload = jwtService.verify<JwtPayload>(token);
    request.user = payload;
    return payload;
  } catch {
    throw new UnauthorizedException();
  }
}
