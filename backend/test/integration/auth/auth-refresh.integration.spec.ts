import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../../src/auth/auth.service.js';
import { RefreshTokenRepository } from '../../../src/auth/refresh-token.repository.js';
import { PrismaService } from '../../../src/storage/prisma.service.js';

jest.mock('bcrypt');

const mockJwt = { sign: jest.fn().mockReturnValue('signed-token') };
const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue('test-api-key'),
  get: jest.fn().mockReturnValue(10),
};
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

/**
 * In-memory stand-in for the RefreshToken table so this spec can exercise the
 * real rotation/reuse-detection logic end to end without a live database.
 */
class FakeRefreshTokenStore {
  private rows = new Map<string, { id: string; userId: string; tokenHash: string; familyId: string; revokedAt: Date | null; expiresAt: Date }>();
  private seq = 0;

  create = jest.fn(async (data: { userId: string; tokenHash: string; familyId: string; expiresAt: Date }) => {
    const id = `rt-${++this.seq}`;
    const row = { id, revokedAt: null, ...data };
    this.rows.set(id, row);
    return row;
  });

  findByHash = jest.fn(async (tokenHash: string) => {
    return [...this.rows.values()].find((r) => r.tokenHash === tokenHash) ?? null;
  });

  revoke = jest.fn(async (id: string) => {
    const row = this.rows.get(id);
    if (row) row.revokedAt = new Date();
  });

  revokeFamily = jest.fn(async (familyId: string) => {
    for (const row of this.rows.values()) {
      if (row.familyId === familyId && !row.revokedAt) row.revokedAt = new Date();
    }
  });

  reset() {
    this.rows.clear();
    this.seq = 0;
    this.create.mockClear();
    this.findByHash.mockClear();
    this.revoke.mockClear();
    this.revokeFamily.mockClear();
  }
}

const fakeStore = new FakeRefreshTokenStore();

async function buildAuthService(): Promise<AuthService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: JwtService, useValue: mockJwt },
      { provide: ConfigService, useValue: mockConfig },
      { provide: PrismaService, useValue: mockPrisma },
      { provide: RefreshTokenRepository, useValue: fakeStore },
    ],
  }).compile();
  return module.get(AuthService);
}

describe('Auth refresh/logout integration', () => {
  let auth: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    fakeStore.reset();
    mockJwt.sign.mockReturnValue('signed-token');
    mockConfig.getOrThrow.mockReturnValue('test-api-key');
    mockConfig.get.mockReturnValue(10);
    auth = await buildAuthService();
  });

  it('register → refresh → reuse of the rotated token is rejected and the family is revoked → logout → refresh again fails', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashed-pw');
    mockPrisma.user.create.mockResolvedValueOnce({ id: 'user-1' });

    const { refreshToken: token1 } = await auth.register({
      email: 'new@example.com',
      password: 'pass123',
      name: 'Bob',
    });

    // First refresh: rotates token1 -> token2, same family.
    const { refreshToken: token2 } = await auth.refresh(token1);
    expect(token2).not.toBe(token1);

    // Reusing the now-revoked token1 must fail and burn the whole family,
    // including the currently-valid token2 (theft-detection behavior).
    await expect(auth.refresh(token1)).rejects.toThrow(UnauthorizedException);
    await expect(auth.refresh(token2)).rejects.toThrow(UnauthorizedException);

    // Fresh login gets a brand new, independent family.
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      passwordHash: 'hashed-pw',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const { refreshToken: token3 } = await auth.loginUser({
      email: 'new@example.com',
      password: 'pass123',
    });

    await auth.logout(token3);

    await expect(auth.refresh(token3)).rejects.toThrow(UnauthorizedException);
  });

  it('logout on an unknown token is a silent no-op', async () => {
    await expect(auth.logout('never-issued')).resolves.toBeUndefined();
  });
});
