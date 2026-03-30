export interface JobSource {
  jobId: string;
  title: string;
  company: string;
  url: string;
  similarity: number;
}

export interface RagResponse {
  answer: string;
  sources: JobSource[];
  retrievedAt: Date;
}
