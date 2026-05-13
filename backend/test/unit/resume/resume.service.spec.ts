import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ResumeService } from '../../../src/resume/resume.service.js';
import { ResumeRepository } from '../../../src/resume/resume.repository.js';
import { ResumeParserService } from '../../../src/resume/resume-parser.service.js';
import { EmbeddingService } from '../../../src/embedding/embedding.service.js';
import { R2StorageService } from '../../../src/storage/r2-storage.service.js';

const mockResumeRepo = {
  findByUserId: jest.fn(),
  upsert: jest.fn(),
  delete: jest.fn(),
};
const mockParser = { parse: jest.fn() };
const mockEmbedding = { embed: jest.fn(), modelName: 'test-model', provider: 'openai' };
const mockR2 = { uploadFile: jest.fn(), getPresignedUrl: jest.fn() };

async function buildModule(): Promise<ResumeService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ResumeService,
      { provide: ResumeRepository, useValue: mockResumeRepo },
      { provide: ResumeParserService, useValue: mockParser },
      { provide: EmbeddingService, useValue: mockEmbedding },
      { provide: R2StorageService, useValue: mockR2 },
    ],
  }).compile();
  return module.get(ResumeService);
}

const SAMPLE_RESUME = {
  id: 'resume-1',
  userId: 'user-1',
  filePath: 'resumes/user-1.pdf',
  rawText: 'Alice Smith — Software Engineer',
  parsedData: { name: 'Alice', skills: ['TypeScript'], experience: [], location: null, summary: null },
  embeddingModel: 'test-model',
  embedding: [0.1, 0.2],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ResumeService', () => {
  let service: ResumeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildModule();
  });

  describe('getResume', () => {
    it('throws NotFoundException when no resume exists', async () => {
      mockResumeRepo.findByUserId.mockResolvedValueOnce(null);

      await expect(service.getResume('user-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the resume when found', async () => {
      mockResumeRepo.findByUserId.mockResolvedValueOnce(SAMPLE_RESUME);

      const result = await service.getResume('user-1');

      expect(result).toEqual(SAMPLE_RESUME);
    });
  });

  describe('getParsedData', () => {
    it('returns null when no resume exists', async () => {
      mockResumeRepo.findByUserId.mockResolvedValueOnce(null);

      const result = await service.getParsedData('user-1');

      expect(result).toBeNull();
    });

    it('returns parsedData when resume exists', async () => {
      mockResumeRepo.findByUserId.mockResolvedValueOnce(SAMPLE_RESUME);

      const result = await service.getParsedData('user-1');

      expect(result).toEqual(SAMPLE_RESUME.parsedData);
    });
  });

  describe('getDownloadUrl', () => {
    it('throws NotFoundException when no resume exists', async () => {
      mockResumeRepo.findByUserId.mockResolvedValueOnce(null);

      await expect(service.getDownloadUrl('user-1')).rejects.toThrow(NotFoundException);
    });

    it('calls r2.getPresignedUrl with the stored filePath', async () => {
      mockResumeRepo.findByUserId.mockResolvedValueOnce(SAMPLE_RESUME);
      mockR2.getPresignedUrl.mockResolvedValueOnce('https://cdn.example.com/resume');

      const url = await service.getDownloadUrl('user-1');

      expect(mockR2.getPresignedUrl).toHaveBeenCalledWith('resumes/user-1.pdf');
      expect(url).toBe('https://cdn.example.com/resume');
    });
  });

  describe('deleteResume', () => {
    it('throws NotFoundException when no resume exists', async () => {
      mockResumeRepo.findByUserId.mockResolvedValueOnce(null);

      await expect(service.deleteResume('user-1')).rejects.toThrow(NotFoundException);

      expect(mockResumeRepo.delete).not.toHaveBeenCalled();
    });

    it('calls repo.delete when resume exists', async () => {
      mockResumeRepo.findByUserId.mockResolvedValueOnce(SAMPLE_RESUME);
      mockResumeRepo.delete.mockResolvedValueOnce(undefined);

      await service.deleteResume('user-1');

      expect(mockResumeRepo.delete).toHaveBeenCalledWith('user-1');
    });
  });
});
