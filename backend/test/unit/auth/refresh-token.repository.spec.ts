import { Test, TestingModule } from '@nestjs/testing';
import { RefreshTokenRepository } from '../../../src/auth/refresh-token.repository.js';
import { PrismaService } from '../../../src/storage/prisma.service.js';

const mockPrisma = {
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

async function buildModule(): Promise<RefreshTokenRepository> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      RefreshTokenRepository,
      { provide: PrismaService, useValue: mockPrisma },
    ],
  }).compile();
  return module.get(RefreshTokenRepository);
}

describe('RefreshTokenRepository', () => {
  let repo: RefreshTokenRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    repo = await buildModule();
  });

  it('create() delegates to prisma.refreshToken.create', async () => {
    const data = {
      userId: 'user-1',
      tokenHash: 'hash',
      familyId: 'family-1',
      expiresAt: new Date(),
    };
    mockPrisma.refreshToken.create.mockResolvedValueOnce({ id: 'rt-1', ...data });

    const result = await repo.create(data);

    expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({ data });
    expect(result.id).toBe('rt-1');
  });

  it('findByHash() looks up by unique tokenHash', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValueOnce({ id: 'rt-1' });

    const result = await repo.findByHash('hash');

    expect(mockPrisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: 'hash' },
    });
    expect(result?.id).toBe('rt-1');
  });

  it('revoke() sets revokedAt on the given row', async () => {
    await repo.revoke('rt-1');

    expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-1' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('revokeFamily() revokes only the still-active rows in the family', async () => {
    await repo.revokeFamily('family-1');

    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
