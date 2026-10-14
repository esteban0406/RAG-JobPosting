import { matchesFilter } from '../../../src/retrieval/job-filter.js';

const job = {
  jobType: 'full_time',
  isRemote: true,
  minSalary: 140000,
  maxSalary: 180000,
};

describe('matchesFilter', () => {
  it('accepts every job without a filter', () => {
    expect(matchesFilter(job)).toBe(true);
  });

  it('uses the top of the range for salaryAtLeast', () => {
    expect(matchesFilter(job, { salaryAtLeast: 150000 })).toBe(true);
    expect(matchesFilter(job, { salaryAtLeast: 200000 })).toBe(false);
  });

  it('falls back to the minimum when the maximum is missing', () => {
    const minOnly = { ...job, maxSalary: null };
    expect(matchesFilter(minOnly, { salaryAtLeast: 140000 })).toBe(true);
    expect(matchesFilter(minOnly, { salaryAtLeast: 150000 })).toBe(false);
  });

  it('never matches salary conditions when the salary is unknown', () => {
    const noSalary = { ...job, minSalary: null, maxSalary: null };
    expect(matchesFilter(noSalary, { salaryAtLeast: 1 })).toBe(false);
    expect(matchesFilter(noSalary, { minSalary: 1 })).toBe(false);
    expect(matchesFilter(noSalary, { maxSalary: 1e9 })).toBe(false);
  });

  it('keeps the benchmark semantics of minSalary and maxSalary', () => {
    expect(matchesFilter(job, { minSalary: 150000 })).toBe(false);
    expect(matchesFilter(job, { maxSalary: 180000 })).toBe(true);
  });

  it('matches any of several job types, never a missing one', () => {
    const filter = { jobType: ['contract', 'freelance'] };
    expect(matchesFilter({ ...job, jobType: 'contract' }, filter)).toBe(true);
    expect(matchesFilter(job, filter)).toBe(false);
    expect(matchesFilter({ ...job, jobType: null }, filter)).toBe(false);
  });

  it('matches job type and work arrangement exactly', () => {
    expect(matchesFilter(job, { jobType: 'full_time', isRemote: true })).toBe(
      true,
    );
    expect(matchesFilter(job, { jobType: 'contract' })).toBe(false);
    expect(matchesFilter(job, { isRemote: false })).toBe(false);
  });
});
