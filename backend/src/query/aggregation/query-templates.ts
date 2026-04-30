// All queries are read-only SELECT. Parameters use $1/$2 positional placeholders — never string-interpolated.
// Numeric params (salary thresholds) must be passed as strings; SQL casts them via ::integer.

export type TemplateKey =
  // ── Counts & distributions ───────────────────────────────────────────────
  | 'count_total'
  | 'count_by_location'
  | 'count_by_job_type'
  | 'count_by_company'
  | 'count_remote'
  // ── Salary statistics ────────────────────────────────────────────────────
  | 'salary_stats_overall'
  | 'salary_stats_by_title' // $1 = '%keyword%'
  | 'salary_stats_by_location'
  | 'salary_stats_by_job_type'
  // ── Filtered job listings ────────────────────────────────────────────────
  | 'jobs_above_salary' // $1 = threshold (e.g. '150000')
  | 'jobs_between_salary' // $1 = min, $2 = max
  | 'list_jobs_by_title' // $1 = '%keyword%'
  | 'list_jobs_by_location' // $1 = '%location%'
  | 'list_jobs_by_company' // $1 = '%company%'
  | 'list_jobs_by_type' // $1 = '%type%'  (e.g. '%full%', '%contract%')
  | 'list_remote_jobs'
  | 'list_jobs_by_skill' // $1 = exact skill string (e.g. 'Python')
  // ── Discovery helpers ────────────────────────────────────────────────────
  | 'list_distinct_titles' // $1 = '%keyword%'
  | 'list_distinct_locations'
  | 'list_distinct_skills'
  | 'list_distinct_companies' // $1 = '%keyword%'
  // ── Trends & insights ────────────────────────────────────────────────────
  | 'top_hiring_companies'
  | 'skills_demand'
  | 'recent_jobs';

export const QUERY_TEMPLATES: Record<TemplateKey, string> = {
  // ── Counts & distributions ───────────────────────────────────────────────

  count_total: `SELECT COUNT(*) AS total FROM "Job"`,

  count_by_location: `SELECT location, COUNT(*) AS count
     FROM "Job"
     WHERE location IS NOT NULL
     GROUP BY location
     ORDER BY count DESC
     LIMIT 20`,

  count_by_job_type: `SELECT "jobType", COUNT(*) AS count
     FROM "Job"
     WHERE "jobType" IS NOT NULL
     GROUP BY "jobType"
     ORDER BY count DESC`,

  count_by_company: `SELECT company, COUNT(*) AS count
     FROM "Job"
     GROUP BY company
     ORDER BY count DESC
     LIMIT 20`,

  count_remote: `SELECT COUNT(*) AS count
     FROM "Job"
     WHERE location ILIKE '%remote%'
        OR "jobType" ILIKE '%remote%'`,

  // ── Salary statistics ────────────────────────────────────────────────────

  salary_stats_overall: `SELECT
       MIN("minSalary")                                         AS min,
       MAX("maxSalary")                                         AS max,
       ROUND(AVG(("minSalary" + "maxSalary") / 2.0))           AS avg_mid,
       COUNT(*) FILTER (WHERE "minSalary" IS NOT NULL)          AS jobs_with_salary
     FROM "Job"`,

  salary_stats_by_title:
    // $1 = '%keyword%'
    `SELECT
       MIN("minSalary")  AS min,
       MAX("maxSalary")  AS max,
       ROUND(AVG("minSalary")) AS avg,
       COUNT(*)          AS job_count
     FROM "Job"
     WHERE "minSalary" IS NOT NULL
       AND title ILIKE $1`,

  salary_stats_by_location: `SELECT
       location,
       MIN("minSalary")        AS min,
       MAX("maxSalary")        AS max,
       ROUND(AVG("minSalary")) AS avg,
       COUNT(*)                AS job_count
     FROM "Job"
     WHERE "minSalary" IS NOT NULL
       AND location IS NOT NULL
     GROUP BY location
     ORDER BY avg DESC
     LIMIT 20`,

  salary_stats_by_job_type: `SELECT
       "jobType",
       MIN("minSalary")        AS min,
       MAX("maxSalary")        AS max,
       ROUND(AVG("minSalary")) AS avg,
       COUNT(*)                AS job_count
     FROM "Job"
     WHERE "minSalary" IS NOT NULL
       AND "jobType" IS NOT NULL
     GROUP BY "jobType"
     ORDER BY avg DESC`,

  // ── Filtered job listings ────────────────────────────────────────────────

  jobs_above_salary:
    // $1 = numeric threshold as string, e.g. '150000'
    `SELECT title, company, location, "jobType", "minSalary", "maxSalary", url
     FROM "Job"
     WHERE "minSalary" >= $1::integer
     ORDER BY "minSalary" DESC
     LIMIT 20`,

  jobs_between_salary:
    // $1 = lower bound, $2 = upper bound
    `SELECT title, company, location, "jobType", "minSalary", "maxSalary", url
     FROM "Job"
     WHERE "minSalary" >= $1::integer
       AND "maxSalary" <= $2::integer
     ORDER BY "minSalary" DESC
     LIMIT 20`,

  list_jobs_by_title:
    // $1 = '%keyword%'
    `SELECT title, company, location, "jobType", "minSalary", "maxSalary", url
     FROM "Job"
     WHERE title ILIKE $1
     ORDER BY "fetchedAt" DESC
     LIMIT 20`,

  list_jobs_by_location:
    // $1 = '%location%'
    `SELECT title, company, location, "jobType", "minSalary", "maxSalary", url
     FROM "Job"
     WHERE location ILIKE $1
     ORDER BY "fetchedAt" DESC
     LIMIT 20`,

  list_jobs_by_company:
    // $1 = '%company%'
    `SELECT title, company, location, "jobType", "minSalary", "maxSalary", url
     FROM "Job"
     WHERE company ILIKE $1
     ORDER BY "fetchedAt" DESC
     LIMIT 20`,

  list_jobs_by_type:
    // $1 = '%type%'  e.g. '%full-time%', '%contract%', '%remote%'
    `SELECT title, company, location, "jobType", "minSalary", "maxSalary", url
     FROM "Job"
     WHERE "jobType" ILIKE $1
     ORDER BY "fetchedAt" DESC
     LIMIT 20`,

  list_remote_jobs: `SELECT title, company, "jobType", "minSalary", "maxSalary", url
     FROM "Job"
     WHERE location ILIKE '%remote%'
        OR "jobType" ILIKE '%remote%'
     ORDER BY "fetchedAt" DESC
     LIMIT 20`,

  list_jobs_by_skill:
    // $1 = exact skill string, e.g. 'Python'
    `SELECT title, company, location, "jobType", "minSalary", "maxSalary", url
     FROM "Job"
     WHERE $1 ILIKE ANY(skills)
     ORDER BY "fetchedAt" DESC
     LIMIT 20`,

  // ── Discovery helpers ────────────────────────────────────────────────────

  list_distinct_titles:
    // $1 = '%keyword%'
    `SELECT DISTINCT title
     FROM "Job"
     WHERE title ILIKE $1
     ORDER BY title
     LIMIT 30`,

  list_distinct_locations: `SELECT DISTINCT location
     FROM "Job"
     WHERE location IS NOT NULL
     ORDER BY location
     LIMIT 50`,

  list_distinct_skills: `SELECT DISTINCT skill
     FROM "Job", unnest(skills) AS skill
     WHERE skill <> ''
     ORDER BY skill
     LIMIT 80`,

  list_distinct_companies:
    // $1 = '%keyword%'
    `SELECT DISTINCT company
     FROM "Job"
     WHERE company ILIKE $1
     ORDER BY company
     LIMIT 30`,

  // ── Trends & insights ────────────────────────────────────────────────────

  top_hiring_companies: `SELECT company, COUNT(*) AS openings
     FROM "Job"
     GROUP BY company
     ORDER BY openings DESC
     LIMIT 20`,

  skills_demand: `SELECT skill, COUNT(*) AS job_count
     FROM "Job", unnest(skills) AS skill
     WHERE skill <> ''
     GROUP BY skill
     ORDER BY job_count DESC
     LIMIT 30`,

  recent_jobs: `SELECT title, company, location, "jobType", "minSalary", "maxSalary", url, "fetchedAt"
     FROM "Job"
     ORDER BY "fetchedAt" DESC
     LIMIT 20`,
};

export const TEMPLATE_KEYS = Object.keys(QUERY_TEMPLATES) as TemplateKey[];
