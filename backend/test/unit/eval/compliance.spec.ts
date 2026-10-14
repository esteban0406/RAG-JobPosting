import { complianceAtK } from '../../../src/eval/compliance.js';

const jobs = new Map([
  [
    'a',
    {
      jobType: 'full_time',
      isRemote: true,
      minSalary: 160000,
      maxSalary: 200000,
    },
  ],
  [
    'b',
    {
      jobType: 'full_time',
      isRemote: false,
      minSalary: 160000,
      maxSalary: 200000,
    },
  ],
  [
    'c',
    { jobType: 'contract', isRemote: true, minSalary: null, maxSalary: null },
  ],
]);
const filter = { isRemote: true, salaryAtLeast: 150000 };

describe('complianceAtK', () => {
  it('is the share of the top k that meets the filter', () => {
    expect(complianceAtK(['a', 'b', 'c'], jobs, filter, 2)).toBe(0.5);
    expect(complianceAtK(['a', 'b', 'c'], jobs, filter, 10)).toBeCloseTo(1 / 3);
  });

  it('is null when nothing was returned', () => {
    expect(complianceAtK([], jobs, filter, 5)).toBeNull();
  });

  it('counts unknown jobs as failing', () => {
    expect(complianceAtK(['a', 'zzz'], jobs, filter, 5)).toBe(0.5);
  });
});
