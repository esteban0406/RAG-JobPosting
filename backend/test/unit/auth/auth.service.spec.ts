import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../../src/auth/auth.service.js';
import { PrismaService } from '../../../src/storage/prisma.service.js';
import { RefreshTokenRepository } from '../../../src/auth/refresh-token.repository.js';

jest.mock('bcrypt');

const mockJwt = { sign: jest.fn().mockReturnValue('signed-token') };
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};
const mockRefreshTokenRepo = {
  create: jest.fn(),
  findByHash: jest.fn(),
  revoke: jest.fn(),
  revokeFamily: jest.fn(),
};
const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue('secret-api-key'),
  get: jest.fn().mockReturnValue(10),
};

async function buildModule(): Promise<AuthService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: JwtService, useValue: mockJwt },
      { provide: PrismaService, useValue: mockPrisma },
      { provide: RefreshTokenRepository, useValue: mockRefreshTokenRepo },
      { provide: ConfigService, useValue: mockConfig },
    ],
  }).compile();
  return module.get(AuthService);
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwt.sign.mockReturnValue('signed-token');
    mockConfig.getOrThrow.mockReturnValue('secret-api-key');
    mockConfig.get.mockReturnValue(10);
    mockRefreshTokenRepo.create.mockResolvedValue(undefined);
    service = await buildModule();
  });

  describe('login', () => {
    it('returns accessToken when API key matches', () => {
      const result = service.login('secret-api-key');
      expect(result.accessToken).toBe('signed-token');
      expect(mockJwt.sign).toHaveBeenCalledWith({ sub: 'admin', role: 'admin' });
    });

    it('throws UnauthorizedException for wrong API key', () => {
      expect(() => service.login('wrong-key')).toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('throws ConflictException when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: '1', email: 'a@b.com' });

      await expect(
        service.register({ email: 'a@b.com', password: 'pass', name: 'A' }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('creates user and returns an access+refresh token pair on success', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashed-password');
      mockPrisma.user.create.mockResolvedValueOnce({ id: 'user-1' });

      const result = await service.register({
        email: 'new@b.com',
        password: 'pass',
        name: 'New User',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('pass', 10);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@b.com',
            passwordHash: 'hashed-password',
          }),
        }),
      );
      expect(result.accessToken).toBe('signed-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBeGreaterThan(0);
      expect(mockJwt.sign).toHaveBeenCalledWith({ sub: 'user-1', role: 'user' });
      expect(mockRefreshTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          tokenHash: expect.any(String),
          familyId: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
    });
  });

  describe('loginUser', () => {
    it('throws UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.loginUser({ email: 'unknown@b.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        passwordHash: 'hashed',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(
        service.loginUser({ email: 'a@b.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns an access+refresh token pair when credentials are valid', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        passwordHash: 'hashed',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      const result = await service.loginUser({
        email: 'a@b.com',
        password: 'correct',
      });

      expect(result.accessToken).toBe('signed-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(mockJwt.sign).toHaveBeenCalledWith({ sub: 'user-1', role: 'user' });
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException when the token is unknown', async () => {
      mockRefreshTokenRepo.findByHash.mockResolvedValueOnce(null);

      await expect(service.refresh('unknown-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('revokes the whole family and throws when a rotated token is reused', async () => {
      mockRefreshTokenRepo.findByHash.mockResolvedValueOnce({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60),
      });

      await expect(service.refresh('reused-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRefreshTokenRepo.revokeFamily).toHaveBeenCalledWith('family-1');
    });

    it('throws UnauthorizedException when the token is expired', async () => {
      mockRefreshTokenRepo.findByHash.mockResolvedValueOnce({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rotates: revokes the old token and issues a new pair in the same family', async () => {
      mockRefreshTokenRepo.findByHash.mockResolvedValueOnce({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
      });

      const result = await service.refresh('valid-token');

      expect(mockRefreshTokenRepo.revoke).toHaveBeenCalledWith('rt-1');
      expect(result.accessToken).toBe('signed-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(mockRefreshTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', familyId: 'family-1' }),
      );
    });
  });

  describe('logout', () => {
    it('revokes the matching refresh token', async () => {
      mockRefreshTokenRepo.findByHash.mockResolvedValueOnce({ id: 'rt-1' });

      await service.logout('some-token');

      expect(mockRefreshTokenRepo.revoke).toHaveBeenCalledWith('rt-1');
    });

    it('is a no-op when the token is unknown (idempotent)', async () => {
      mockRefreshTokenRepo.findByHash.mockResolvedValueOnce(null);

      await expect(service.logout('unknown-token')).resolves.toBeUndefined();
      expect(mockRefreshTokenRepo.revoke).not.toHaveBeenCalled();
    });
  });
});
