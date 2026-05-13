import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from '../../../src/user/user.service.js';
import { UserRepository } from '../../../src/user/user.repository.js';

const mockRepo = {
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  addFavorite: jest.fn(),
  removeFavorite: jest.fn(),
  getFavorites: jest.fn(),
};

async function buildModule(): Promise<UserService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      UserService,
      { provide: UserRepository, useValue: mockRepo },
    ],
  }).compile();
  return module.get(UserService);
}

const FULL_USER = {
  id: 'user-1',
  email: 'a@b.com',
  name: 'Alice',
  passwordHash: 'hashed',
  skills: ['TypeScript'],
  preferredFields: [],
  location: 'Austin',
  resume: { id: 'resume-1' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildModule();
  });

  describe('getProfile', () => {
    it('throws NotFoundException when user does not exist', async () => {
      mockRepo.findById.mockResolvedValueOnce(null);

      await expect(service.getProfile('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('strips passwordHash from returned profile', async () => {
      mockRepo.findById.mockResolvedValueOnce(FULL_USER);

      const profile = await service.getProfile('user-1');

      expect((profile as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('sets hasResume=true when resume exists', async () => {
      mockRepo.findById.mockResolvedValueOnce(FULL_USER);

      const profile = await service.getProfile('user-1');

      expect(profile.hasResume).toBe(true);
    });

    it('sets hasResume=false when resume is null', async () => {
      mockRepo.findById.mockResolvedValueOnce({ ...FULL_USER, resume: null });

      const profile = await service.getProfile('user-1');

      expect(profile.hasResume).toBe(false);
    });
  });

  describe('updateProfile', () => {
    it('throws NotFoundException when user does not exist', async () => {
      mockRepo.findById.mockResolvedValueOnce(null);

      await expect(
        service.updateProfile('missing-id', { name: 'Bob' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('returns updated profile without passwordHash', async () => {
      mockRepo.findById.mockResolvedValueOnce(FULL_USER);
      const updated = { ...FULL_USER, name: 'Bob' };
      mockRepo.update.mockResolvedValueOnce(updated);

      const profile = await service.updateProfile('user-1', { name: 'Bob' });

      expect(profile.name).toBe('Bob');
      expect((profile as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  describe('deleteAccount', () => {
    it('throws NotFoundException when user does not exist', async () => {
      mockRepo.findById.mockResolvedValueOnce(null);

      await expect(service.deleteAccount('missing-id')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('calls repo.delete when user exists', async () => {
      mockRepo.findById.mockResolvedValueOnce(FULL_USER);
      mockRepo.delete.mockResolvedValueOnce(undefined);

      await service.deleteAccount('user-1');

      expect(mockRepo.delete).toHaveBeenCalledWith('user-1');
    });
  });

  describe('favorites', () => {
    it('saveFavorite delegates to repo.addFavorite', async () => {
      mockRepo.addFavorite.mockResolvedValueOnce(undefined);

      await service.saveFavorite('user-1', 'job-1');

      expect(mockRepo.addFavorite).toHaveBeenCalledWith('user-1', 'job-1');
    });

    it('removeFavorite delegates to repo.removeFavorite', async () => {
      mockRepo.removeFavorite.mockResolvedValueOnce(undefined);

      await service.removeFavorite('user-1', 'job-1');

      expect(mockRepo.removeFavorite).toHaveBeenCalledWith('user-1', 'job-1');
    });

    it('getFavorites delegates to repo.getFavorites', async () => {
      const jobs = [{ id: 'job-1', title: 'Engineer' }];
      mockRepo.getFavorites.mockResolvedValueOnce(jobs);

      const result = await service.getFavorites('user-1');

      expect(result).toEqual(jobs);
      expect(mockRepo.getFavorites).toHaveBeenCalledWith('user-1');
    });
  });
});
