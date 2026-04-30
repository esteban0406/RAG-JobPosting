export interface JobFilters {
  title?: string;
  minSalary?: number;
  maxSalary?: number;
  location?: string;
  jobType?: string;
}

export function buildFilterQuery(filters: JobFilters): {
  sql: string;
  params: unknown[];
} {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.title) {
    params.push(filters.title);
    conditions.push(`title ILIKE $${params.length}`);
  }
  if (filters.minSalary !== undefined) {
    params.push(filters.minSalary);
    conditions.push(`"minSalary" >= $${params.length}`);
  }
  if (filters.maxSalary !== undefined) {
    params.push(filters.maxSalary);
    conditions.push(`"maxSalary" <= $${params.length}`);
  }
  if (filters.location) {
    params.push(filters.location);
    conditions.push(`location ILIKE $${params.length}`);
  }
  if (filters.jobType) {
    params.push(filters.jobType);
    conditions.push(`"jobType" ILIKE $${params.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT id, title, company, location, "jobType", "minSalary", "maxSalary", url
FROM "Job" ${where} ORDER BY "fetchedAt" DESC LIMIT 30`;
  return { sql, params };
}
