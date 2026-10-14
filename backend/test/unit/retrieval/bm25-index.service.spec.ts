import { Bm25IndexService } from '../../../src/retrieval/bm25-index.service.js';
import type { JobRepository } from '../../../src/storage/job.repository.js';

const job = (id: string, title: string, salary: number | null) => ({
  id,
  title,
  skills: [],
  description: '',
  jobType: 'full_time',
  isRemote: true,
  minSalary: salary,
  maxSalary: salary,
});

function build() {
  const jobs = {
    findAllUnpaged: jest
      .fn()
      .mockResolvedValue([
        job('a', 'python engineer', 200000),
        job('b', 'python developer', 90000),
      ]),
  };
  return {
    service: new Bm25IndexService(jobs as unknown as JobRepository),
    jobs,
  };
}

describe('Bm25IndexService', () => {
  it('builds the index once and reuses it', async () => {
    const { service, jobs } = build();

    await service.search('python', 10);
    await service.search('engineer', 10);

    expect(jobs.findAllUnpaged).toHaveBeenCalledTimes(1);
  });

  it('applies the filter to the job attributes', async () => {
    const { service } = build();

    const hits = await service.search('python', 10, { salaryAtLeast: 150000 });

    expect(hits.map((h) => h.id)).toEqual(['a']);
  });

  it('rebuilds after invalidate', async () => {
    const { service, jobs } = build();

    await service.search('python', 10);
    service.invalidate();
    await service.search('python', 10);

    expect(jobs.findAllUnpaged).toHaveBeenCalledTimes(2);
  });
});
