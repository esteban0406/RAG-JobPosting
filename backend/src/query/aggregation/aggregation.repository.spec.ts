import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AggregationRepository } from './aggregation.repository.js';
import { QUERY_TEMPLATES } from './query-templates.js';

const mockQueryRawUnsafe = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('../../../generated/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: mockConnect,
    $disconnect: mockDisconnect,
    $queryRawUnsafe: mockQueryRawUnsafe,
  })),
}));

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

async function buildModule(): Promise<AggregationRepository> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AggregationRepository,
      {
        provide: ConfigService,
        useValue: { get: jest.fn().mockReturnValue('postgresql://test') },
      },
    ],
  }).compile();

  const repo = module.get(AggregationRepository);
  await repo.onModuleInit();
  return repo;
}

describe('AggregationRepository', () => {
  let repo: AggregationRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
    repo = await buildModule();
  });

  it('throws BadRequestException for unknown template key', async () => {
    await expect(repo.execute('unknown_key' as never, [])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('calls $queryRawUnsafe with the correct SQL for a known key', async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ location: 'NYC', count: 5 }]);

    await repo.execute('count_by_location', []);

    expect(mockQueryRawUnsafe).toHaveBeenCalledWith(
      QUERY_TEMPLATES['count_by_location'],
    );
  });

  it('passes params as additional arguments to $queryRawUnsafe', async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ title: 'Nurse' }]);

    await repo.execute('list_distinct_titles', ['%nurse%']);

    expect(mockQueryRawUnsafe).toHaveBeenCalledWith(
      QUERY_TEMPLATES['list_distinct_titles'],
      '%nurse%',
    );
  });

  it('returns rows from $queryRawUnsafe', async () => {
    const rows = [{ company: 'Acme', count: 3 }];
    mockQueryRawUnsafe.mockResolvedValueOnce(rows);

    const result = await repo.execute('count_by_company', []);

    expect(result).toEqual(rows);
  });
});
