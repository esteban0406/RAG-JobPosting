export interface RawJobDto {
  sourceId: string;
  source: string;
  title: string;
  company: string;
  location?: string;
  description: string;
  url: string;
  jobType?: string;
  salary?: string;
}

export interface JobProvider {
  fetchJobs(page: number): Promise<RawJobDto[]>;
  hasNextPage(page: number, results: RawJobDto[]): boolean;
}
