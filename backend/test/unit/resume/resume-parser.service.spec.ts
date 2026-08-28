import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

const mockCreate = jest.fn();

jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

import { ResumeParserService } from '../../../src/resume/resume-parser.service.js';

const mockConfig = {
  get: jest.fn((key: string, fallback?: unknown) => {
    if (key === 'NODE_ENV') return 'production';
    if (key === 'GROQ_API_KEY') return 'test-key';
    if (key === 'GROQ_API_KEY2') return undefined;
    if (key === 'RESUME_PARSER_MODEL') return fallback ?? 'qwen/qwen3.6-27b';
    return fallback;
  }),
};

async function buildModule(): Promise<ResumeParserService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ResumeParserService,
      { provide: ConfigService, useValue: mockConfig },
    ],
  }).compile();
  return module.get(ResumeParserService);
}

describe('ResumeParserService', () => {
  let service: ResumeParserService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildModule();
  });

  it('requests reasoning_format hidden so the model does not emit a <think> block', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"name":"Jane Doe","skills":["Python"]}' } }],
    });

    await service.parse('resume text');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning_format: 'hidden',
        reasoning_effort: 'none',
      }),
    );
  });

  it('parses a clean JSON response into a ParsedResume', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              name: 'Jane Doe',
              email: 'jane@example.com',
              linkedin: null,
              phone: null,
              location: 'SF',
              summary: 'ML engineer.',
              skills: ['Python', 'PyTorch'],
              experience: [
                {
                  company: 'Acme',
                  title: 'ML Engineer',
                  startDate: 'Jan 2019',
                  endDate: 'Present',
                  description: 'Built things.',
                },
              ],
              education: [],
              certifications: [],
            }),
          },
        },
      ],
    });

    const result = await service.parse('resume text');

    expect(result.name).toBe('Jane Doe');
    expect(result.skills).toEqual(['Python', 'PyTorch']);
    expect(result.experience).toHaveLength(1);
    expect(result.experience[0].company).toBe('Acme');
  });

  it('still recovers the answer if a <think> block slips through anyway (defense in depth)', async () => {
    const content = `<think>
Let me draft this: {"name": "draft", "skills": []}
Looks right, I'll output it now.
</think>

{"name":"Jane Doe","email":null,"linkedin":null,"phone":null,"location":null,"summary":null,"skills":["Python"],"experience":[],"education":[],"certifications":[]}`;
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content } }] });

    const result = await service.parse('resume text');

    expect(result.name).toBe('Jane Doe');
    expect(result.skills).toEqual(['Python']);
  });

  it('falls back to an empty ParsedResume when the response has no valid JSON at all', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Sorry, I cannot process this.' } }],
    });

    const result = await service.parse('resume text');

    expect(result.name).toBeNull();
    expect(result.skills).toEqual([]);
    expect(result.experience).toEqual([]);
  });

  it('strips markdown code fences around the JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: '```json\n{"name":"Jane Doe","skills":["Go"]}\n```',
          },
        },
      ],
    });

    const result = await service.parse('resume text');

    expect(result.name).toBe('Jane Doe');
    expect(result.skills).toEqual(['Go']);
  });
});
