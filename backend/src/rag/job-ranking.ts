import type { JobChunkResult } from '../storage/vector-store/vector-store.interface.js';

export interface RankedJob {
  jobId: string;
  // Similarity of the job's best-matching chunk.
  score: number;
  // The job's retrieved chunks, most similar first.
  chunks: JobChunkResult[];
}

// Groups chunk hits by job and ranks jobs by their best chunk. Shared by the
// RAG pipeline and the evaluation so both rank jobs the same way.
export function rankJobsFromChunks(chunks: JobChunkResult[]): RankedJob[] {
  const byJob = new Map<string, JobChunkResult[]>();
  for (const chunk of chunks) {
    const group = byJob.get(chunk.jobId);
    if (group) group.push(chunk);
    else byJob.set(chunk.jobId, [chunk]);
  }

  return Array.from(byJob.entries())
    .map(([jobId, group]) => {
      const sorted = [...group].sort((a, b) => b.similarity - a.similarity);
      return { jobId, score: sorted[0].similarity, chunks: sorted };
    })
    .sort((a, b) => b.score - a.score);
}
