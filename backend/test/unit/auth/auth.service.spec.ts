import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../../src/auth/auth.service.js';
import { PrismaService } from '../../../src/storage/prisma.service.js';

jest.mock('bcrypt');

const mockJwt = { sign: jest.fn().mockReturnValue('signed-token') };
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
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

    it('creates user and returns accessToken on success', async () => {
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
      expect(mockJwt.sign).toHaveBeenCalledWith({ sub: 'user-1', role: 'user' });
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

    it('returns accessToken when credentials are valid', async () => {
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
      expect(mockJwt.sign).toHaveBeenCalledWith({ sub: 'user-1', role: 'user' });
    });
  });
});
