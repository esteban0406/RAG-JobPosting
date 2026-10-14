import type { JobChunkResult } from '../storage/vector-store/vector-store.interface.js';

export interface JobHeaderFields {
  title: string;
  company: string;
  location: string | null;
  jobType: string | null;
  minSalary: number | null;
  maxSalary: number | null;
}

function salaryText(min: number | null, max: number | null): string {
  if (!min) return '';
  const upper = max ? `–$${max.toLocaleString()}` : '+';
  return ` | Salary: $${min.toLocaleString()}${upper}`;
}

// One line with the job's identity and structured attributes, shared by the
// LLM context and the reranker input.
export function jobHeader(job: JobHeaderFields): string {
  const location = job.location ? ` | Location: ${job.location}` : '';
  const jobType = job.jobType ? ` | Type: ${job.jobType}` : '';
  const salary = salaryText(job.minSalary, job.maxSalary);
  return `Job: ${job.title} at ${job.company}${location}${jobType}${salary}`;
}

// The job's chunks, most similar first, labelled with their type.
export function chunksText(chunks: JobChunkResult[], maxChars: number): string {
  return chunks
    .map((c) => `[${c.chunkType}]: ${c.chunkText}`)
    .join('\n\n')
    .slice(0, maxChars);
}
