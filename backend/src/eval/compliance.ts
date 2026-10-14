import { matchesFilter, type FilterableJob } from '../retrieval/job-filter.js';
import type { VectorFilter } from '../storage/vector-store/vector-store.interface.js';

// Share of the top-k jobs a system returned that meet the query's expected
// filter, read from the job attributes (no judge involved). Null when the
// system returned nothing; jobs missing from the corpus count as failing.
export function complianceAtK(
  jobIds: string[],
  jobs: Map<string, FilterableJob>,
  filter: VectorFilter,
  k: number,
): number | null {
  const top = jobIds.slice(0, k);
  if (top.length === 0) return null;
  const meeting = top.filter((id) => {
    const job = jobs.get(id);
    return job !== undefined && matchesFilter(job, filter);
  }).length;
  return meeting / top.length;
}
