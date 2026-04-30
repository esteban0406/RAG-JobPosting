import { JobType } from '../../llm/job-type.enum.js';

const MAP: Record<string, JobType> = {
  full_time: JobType.FULL_TIME,
  'full-time': JobType.FULL_TIME,
  fulltime: JobType.FULL_TIME,
  permanent: JobType.FULL_TIME,
  'full time': JobType.FULL_TIME,
  part_time: JobType.PART_TIME,
  'part-time': JobType.PART_TIME,
  parttime: JobType.PART_TIME,
  'part time': JobType.PART_TIME,
  contract: JobType.CONTRACT,
  contractor: JobType.CONTRACT,
  'contract-to-hire': JobType.CONTRACT,
  'contract to hire': JobType.CONTRACT,
  intern: JobType.INTERNSHIP,
  internship: JobType.INTERNSHIP,
  freelance: JobType.FREELANCE,
  freelancer: JobType.FREELANCE,
};

export function normalizeJobType(
  raw: string | undefined | null,
): JobType | null {
  if (!raw) return null;
  return MAP[raw.toLowerCase().trim()] ?? null;
}
