import { buildFilterQuery, type JobFilters } from './job-filter-builder.js';

describe('buildFilterQuery', () => {
  it('returns no WHERE clause and empty params when filters are empty', () => {
    const { sql, params } = buildFilterQuery({});
    expect(params).toHaveLength(0);
    expect(sql).not.toContain('WHERE');
  });

  it('builds title-only filter', () => {
    const { sql, params } = buildFilterQuery({ title: '%devops%' });
    expect(params).toEqual(['%devops%']);
    expect(sql).toContain('title ILIKE $1');
    expect(sql).not.toContain('"minSalary" >=');
  });

  it('builds minSalary-only filter', () => {
    const { sql, params } = buildFilterQuery({ minSalary: 150000 });
    expect(params).toEqual([150000]);
    expect(sql).toContain('"minSalary" >= $1');
  });

  it('builds title + minSalary compound filter', () => {
    const { sql, params } = buildFilterQuery({
      title: '%devops%',
      minSalary: 150000,
    });
    expect(params).toEqual(['%devops%', 150000]);
    expect(sql).toContain('title ILIKE $1');
    expect(sql).toContain('"minSalary" >= $2');
    expect(sql).toContain('AND');
  });

  it('builds all 4 active filters', () => {
    const filters: JobFilters = {
      title: '%engineer%',
      minSalary: 100000,
      location: '%remote%',
      jobType: '%full%',
    };
    const { sql, params } = buildFilterQuery(filters);
    expect(params).toHaveLength(4);
    expect(sql).toContain('title ILIKE $1');
    expect(sql).toContain('"minSalary" >= $2');
    expect(sql).toContain('location ILIKE $3');
    expect(sql).toContain('"jobType" ILIKE $4');
  });

  it('builds maxSalary filter', () => {
    const { sql, params } = buildFilterQuery({ maxSalary: 200000 });
    expect(params).toEqual([200000]);
    expect(sql).toContain('"maxSalary" <= $1');
  });

  it('always selects id in the output', () => {
    const { sql } = buildFilterQuery({ title: '%python%' });
    expect(sql).toMatch(/SELECT id,/);
  });

  it('always includes LIMIT 30', () => {
    const { sql } = buildFilterQuery({});
    expect(sql).toContain('LIMIT 30');
  });
});
