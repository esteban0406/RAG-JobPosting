import { normalizeJobType } from '../ingestion/providers/normalize-job-type.js';
import { JobType } from '../llm/job-type.enum.js';
import type { VectorFilter } from '../storage/vector-store/vector-store.interface.js';

// Structured constraints the classifier extracts from a query.
export interface JobFilters {
  title?: string;
  // The job must be able to pay at least this much (USD per year).
  minSalary?: number;
  maxSalary?: number;
  location?: string;
  jobType?: string;
  isRemote?: boolean;
}

// The sources label most freelance work as contract (e.g. "Freelance Product
// and Brand Designers" is a contract posting), so asking for freelance work
// accepts both.
function jobTypeFilter(jobType: JobType): string | string[] {
  return jobType === JobType.FREELANCE
    ? [JobType.CONTRACT, JobType.FREELANCE]
    : jobType;
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// Maps extracted constraints to a vector-store filter. The title and places
// other than "remote" are left to semantic retrieval: matching them literally
// is the lexical limitation the dense pipeline exists to avoid.
export function toVectorFilter(filters?: JobFilters): VectorFilter | undefined {
  if (!filters) return undefined;
  const filter: VectorFilter = {};
  if (isPositive(filters.minSalary)) filter.salaryAtLeast = filters.minSalary;
  if (isPositive(filters.maxSalary)) filter.maxSalary = filters.maxSalary;
  const jobType = normalizeJobType(filters.jobType?.replace(/%/g, ''));
  if (jobType) filter.jobType = jobTypeFilter(jobType);
  if (typeof filters.isRemote === 'boolean') {
    filter.isRemote = filters.isRemote;
  } else if (/remote/i.test(filters.location ?? '')) {
    filter.isRemote = true;
  }
  return Object.keys(filter).length > 0 ? filter : undefined;
}

// Explicit request parameters take precedence over constraints extracted
// from the query text.
export function mergeFilters(
  extracted?: VectorFilter,
  explicit?: VectorFilter,
): VectorFilter | undefined {
  const merged: Record<string, unknown> = { ...extracted };
  for (const [key, value] of Object.entries(explicit ?? {})) {
    if (value !== undefined) merged[key] = value;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

// Filters passed explicitly in the request (SearchQueryDto). The request's job
// "type" enum includes "remote", which is a work arrangement, not a job type.
export function filterFromRequest(request: {
  location?: string;
  minSalary?: number;
  type?: string;
}): VectorFilter | undefined {
  const filter: VectorFilter = {};
  if (isPositive(request.minSalary)) filter.salaryAtLeast = request.minSalary;
  if (request.type === 'remote') {
    filter.isRemote = true;
  } else {
    const jobType = normalizeJobType(request.type);
    if (jobType) filter.jobType = jobTypeFilter(jobType);
  }
  if (/^\s*remote\s*$/i.test(request.location ?? '')) filter.isRemote = true;
  return Object.keys(filter).length > 0 ? filter : undefined;
}
