import { JobType } from './job-type.enum.js';

export interface ParsedJobDto {
  summary: string | null;
  salary: string | null;
  responsibilities: string[] | null;
  requirements: string[] | null;
  benefits: string[] | null;
  skills: string[] | null;
  jobType: JobType | null;
  isRemote: boolean | null;
}

export const NULL_PARSED_JOB: ParsedJobDto = {
  summary: null,
  salary: null,
  responsibilities: null,
  requirements: null,
  benefits: null,
  skills: null,
  jobType: null,
  isRemote: null,
};
