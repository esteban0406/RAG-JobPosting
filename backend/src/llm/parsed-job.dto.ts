export interface ParsedJobDto {
  summary: string | null;
  salary: string | null;
  responsibilities: string[] | null;
  requirements: string[] | null;
  benefits: string[] | null;
  tools: string[] | null;
}

export const NULL_PARSED_JOB: ParsedJobDto = {
  summary: null,
  salary: null,
  responsibilities: null,
  requirements: null,
  benefits: null,
  tools: null,
};
