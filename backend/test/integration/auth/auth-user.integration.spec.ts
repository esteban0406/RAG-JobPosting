import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../../src/auth/auth.service.js';
import { RefreshTokenRepository } from '../../../src/auth/refresh-token.repository.js';
import { UserService } from '../../../src/user/user.service.js';
import { UserRepository } from '../../../src/user/user.repository.js';
import { PrismaService } from '../../../src/storage/prisma.service.js';

jest.mock('bcrypt');

const mockJwt = { sign: jest.fn() };
const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue('test-api-key'),
  get: jest.fn().mockReturnValue(10),
};
const mockRefreshTokenRepo = {
  create: jest.fn().mockResolvedValue(undefined),
  findByHash: jest.fn(),
  revoke: jest.fn(),
  revokeFamily: jest.fn(),
};
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  job: { findUnique: jest.fn() },
  userFavorite: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
};

const USER = {
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: '$2b$10$hashedpassword',
  name: 'Alice',
  skills: [],
  preferredFields: [],
  location: 'NYC',
  resume: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

async function buildModule(): Promise<{ auth: AuthService; user: UserService }> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AuthService,
      UserService,
      UserRepository,
      { provide: JwtService, useValue: mockJwt },
      { provide: ConfigService, useValue: mockConfig },
      { provide: PrismaService, useValue: mockPrisma },
      { provide: RefreshTokenRepository, useValue: mockRefreshTokenRepo },
    ],
  }).compile();
  return {
    auth: module.get(AuthService),
    user: module.get(UserService),
  };
}

describe('Auth + User Integration', () => {
  let auth: AuthService;
  let user: UserService;

  beforeAll(async () => {
    ({ auth, user } = await buildModule());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockJwt.sign.mockReturnValue('signed-token');
    mockConfig.getOrThrow.mockReturnValue('test-api-key');
    mockConfig.get.mockReturnValue(10);
  });

  describe('register → conflict check → JWT sign', () => {
    it('creates user and returns accessToken when email is not taken', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashed-pw');
      mockPrisma.user.create.mockResolvedValueOnce({ id: 'user-1' });

      const result = await auth.register({
        email: 'new@example.com',
        password: 'pass123',
        name: 'Bob',
      });

      expect(result.accessToken).toBe('signed-token');
      expect(bcrypt.hash).toHaveBeenCalledWith('pass123', 10);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@example.com',
            passwordHash: 'hashed-pw',
          }),
        }),
      );
      expect(mockJwt.sign).toHaveBeenCalledWith({ sub: 'user-1', role: 'user' });
    });

    it('throws ConflictException without creating when email is already taken', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(USER);

      await expect(
        auth.register({ email: 'test@example.com', password: 'pass', name: 'Alice' }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });
  });

  describe('loginUser', () => {
    it('throws UnauthorizedException when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        auth.loginUser({ email: 'unknown@example.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(USER);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(
        auth.loginUser({ email: 'test@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns accessToken when credentials are valid', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(USER);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      const result = await auth.loginUser({
        email: 'test@example.com',
        password: 'correct',
      });

      expect(result.accessToken).toBe('signed-token');
      expect(mockJwt.sign).toHaveBeenCalledWith({ sub: 'user-1', role: 'user' });
    });
  });

  describe('getProfile via UserService → UserRepository chain', () => {
    it('returns profile DTO without passwordHash and with correct hasResume=false', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ ...USER, resume: null });

      const profile = await user.getProfile('user-1');

      expect(profile.id).toBe('user-1');
      expect(profile.hasResume).toBe(false);
      expect((profile as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        include: { resume: { select: { id: true } } },
      });
    });

    it('sets hasResume=true when resume record exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...USER,
        resume: { id: 'resume-1' },
      });

      const profile = await user.getProfile('user-1');

      expect(profile.hasResume).toBe(true);
    });

    it('throws NotFoundException through UserService → UserRepository when user is missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(user.getProfile('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile chain', () => {
    it('returns updated profile without passwordHash', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(USER);
      mockPrisma.user.update.mockResolvedValueOnce({ ...USER, name: 'Bob' });

      const profile = await user.updateProfile('user-1', { name: 'Bob' });

      expect(profile.name).toBe('Bob');
      expect((profile as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { name: 'Bob' },
      });
    });

    it('throws NotFoundException when user is missing, does NOT call update', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(user.updateProfile('nonexistent', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteAccount chain', () => {
    it('calls prisma.user.delete when user exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(USER);
      mockPrisma.user.delete.mockResolvedValueOnce(undefined);

      await user.deleteAccount('user-1');

      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('throws NotFoundException when user is missing, does NOT call delete', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(user.deleteAccount('nonexistent')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });
  });
});
