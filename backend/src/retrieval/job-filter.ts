import type {
  VectorFilter,
  VectorJobMeta,
} from '../storage/vector-store/vector-store.interface.js';

export type FilterableJob = Pick<
  VectorJobMeta,
  'jobType' | 'isRemote' | 'minSalary' | 'maxSalary'
>;

// In-memory twin of PgVectorStore.buildFilter and QdrantVectorStore's filter,
// so lexical candidates obey the same constraints as dense ones. A missing
// salary never satisfies a salary condition, as NULL comparisons in SQL.
export function matchesFilter(
  job: FilterableJob,
  filter?: VectorFilter,
): boolean {
  if (!filter) return true;
  if (
    filter.minSalary !== undefined &&
    !(job.minSalary !== null && job.minSalary >= filter.minSalary)
  ) {
    return false;
  }
  if (
    filter.maxSalary !== undefined &&
    !(job.maxSalary !== null && job.maxSalary <= filter.maxSalary)
  ) {
    return false;
  }
  if (filter.salaryAtLeast !== undefined) {
    const top = job.maxSalary ?? job.minSalary;
    if (top === null || top < filter.salaryAtLeast) return false;
  }
  if (filter.jobType !== undefined && job.jobType !== filter.jobType) {
    return false;
  }
  if (filter.isRemote !== undefined && job.isRemote !== filter.isRemote) {
    return false;
  }
  return true;
}
