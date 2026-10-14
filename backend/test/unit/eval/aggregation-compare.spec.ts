import {
  compareRows,
  normalizeValue,
} from '../../../src/eval/aggregation-compare.js';

describe('normalizeValue', () => {
  it('turns bigint counts and decimals into numbers', () => {
    expect(normalizeValue(BigInt(42))).toBe(42);
    expect(normalizeValue({ toNumber: () => 175000 })).toBe(175000);
  });

  it('keeps nulls and serializes dates', () => {
    expect(normalizeValue(undefined)).toBeNull();
    expect(normalizeValue(new Date('2026-10-10T00:00:00Z'))).toBe(
      '2026-10-10T00:00:00.000Z',
    );
  });
});

describe('compareRows', () => {
  it('matches a scalar regardless of column name and numeric type', () => {
    expect(compareRows([{ total: BigInt(1068) }], [{ count: 1068 }])).toEqual({
      goldRows: 1,
      coveredRows: 1,
      coverage: 1,
      exact: true,
    });
  });

  it('accepts extra columns in the system row', () => {
    const system = [{ min: 50000, max: 250000, avg: 120000, job_count: 7 }];
    expect(compareRows(system, [{ min: 50000, max: 250000 }]).exact).toBe(true);
  });

  it('does not penalize a longer system top-k', () => {
    const system = [
      { company: 'A', count: BigInt(9) },
      { company: 'B', count: BigInt(5) },
      { company: 'C', count: BigInt(2) },
    ];
    const gold = [
      { company: 'A', count: 9 },
      { company: 'B', count: 5 },
    ];
    expect(compareRows(system, gold).exact).toBe(true);
  });

  it('reports partial coverage when reference rows are missing', () => {
    const system = [{ jobType: 'full_time', count: 904 }];
    const gold = [
      { jobType: 'full_time', count: 904 },
      { jobType: null, count: 61 },
    ];
    expect(compareRows(system, gold)).toEqual({
      goldRows: 2,
      coveredRows: 1,
      coverage: 0.5,
      exact: false,
    });
  });

  it('requires repeated values to appear as many times', () => {
    expect(compareRows([{ a: 5 }], [{ min: 5, max: 5 }]).exact).toBe(false);
  });

  it('fails when the system returns nothing', () => {
    expect(compareRows([], [{ count: 3 }]).coverage).toBe(0);
  });
});
