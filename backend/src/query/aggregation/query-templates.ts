export type TemplateKey =
  | 'count_by_location'
  | 'count_by_job_type'
  | 'count_by_company'
  | 'salary_stats_by_title'
  | 'list_distinct_titles'
  | 'list_distinct_locations';

// All queries are read-only SELECT. Parameters use $1 placeholder — never string-interpolated.
export const QUERY_TEMPLATES: Record<TemplateKey, string> = {
  count_by_location: `SELECT location, COUNT(*) AS count FROM "Job" WHERE location IS NOT NULL GROUP BY location ORDER BY count DESC LIMIT 20`,
  count_by_job_type: `SELECT "jobType", COUNT(*) AS count FROM "Job" WHERE "jobType" IS NOT NULL GROUP BY "jobType" ORDER BY count DESC`,
  count_by_company: `SELECT company, COUNT(*) AS count FROM "Job" GROUP BY company ORDER BY count DESC LIMIT 20`,
  salary_stats_by_title: `SELECT MIN("minSalary") AS min, MAX("maxSalary") AS max, ROUND(AVG("minSalary")) AS avg FROM "Job" WHERE "minSalary" IS NOT NULL AND title ILIKE $1`,
  list_distinct_titles: `SELECT DISTINCT title FROM "Job" WHERE title ILIKE $1 ORDER BY title LIMIT 30`,
  list_distinct_locations: `SELECT DISTINCT location FROM "Job" WHERE location IS NOT NULL ORDER BY location LIMIT 30`,
};

export const TEMPLATE_KEYS = Object.keys(QUERY_TEMPLATES) as TemplateKey[];
