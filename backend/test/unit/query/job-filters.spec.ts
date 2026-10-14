import {
  filterFromRequest,
  mergeFilters,
  toVectorFilter,
} from '../../../src/query/job-filters.js';

describe('toVectorFilter', () => {
  it('maps a salary floor to what the job can pay at most', () => {
    expect(toVectorFilter({ minSalary: 150000 })).toEqual({
      salaryAtLeast: 150000,
    });
  });

  it('normalizes the job type and drops unknown types', () => {
    expect(toVectorFilter({ jobType: '%Full-Time%' })).toEqual({
      jobType: 'full_time',
    });
    expect(toVectorFilter({ jobType: 'gig' })).toBeUndefined();
  });

  it('reads remote work from isRemote, or from a "remote" location', () => {
    expect(toVectorFilter({ isRemote: false })).toEqual({ isRemote: false });
    expect(toVectorFilter({ location: '%remote%' })).toEqual({
      isRemote: true,
    });
  });

  it('leaves the title and other places to semantic retrieval', () => {
    expect(
      toVectorFilter({ title: '%python%', location: '%europe%' }),
    ).toBeUndefined();
  });

  it('ignores non-positive or non-numeric salaries', () => {
    expect(toVectorFilter({ minSalary: 0, maxSalary: NaN })).toBeUndefined();
  });
});

describe('filterFromRequest', () => {
  it('treats the "remote" job type as a work arrangement', () => {
    expect(filterFromRequest({ type: 'remote' })).toEqual({ isRemote: true });
    expect(filterFromRequest({ type: 'contract' })).toEqual({
      jobType: 'contract',
    });
  });

  it('maps minSalary and a "remote" location', () => {
    expect(filterFromRequest({ minSalary: 90000, location: 'Remote' })).toEqual(
      { salaryAtLeast: 90000, isRemote: true },
    );
  });

  it('returns undefined when nothing applies', () => {
    expect(filterFromRequest({ location: 'Austin' })).toBeUndefined();
  });
});

describe('mergeFilters', () => {
  it('lets explicit values override extracted ones, skipping undefined', () => {
    expect(
      mergeFilters(
        { salaryAtLeast: 150000, isRemote: true },
        { salaryAtLeast: 100000, isRemote: undefined },
      ),
    ).toEqual({ salaryAtLeast: 100000, isRemote: true });
  });

  it('returns undefined when both are empty', () => {
    expect(mergeFilters(undefined, undefined)).toBeUndefined();
  });
});
