import { readFileSync, writeFileSync } from 'fs';
import type { RetrievedJob } from './systems/retrieval-system.js';

// TREC run format: "<qid> Q0 <docid> <rank> <score> <tag>".
export function writeTrecRun(
  path: string,
  tag: string,
  results: Map<string, RetrievedJob[]>,
): void {
  const lines: string[] = [];
  for (const [queryId, jobs] of results) {
    jobs.forEach((job, i) => {
      lines.push(
        `${queryId} Q0 ${job.jobId} ${i + 1} ${job.score.toFixed(6)} ${tag}`,
      );
    });
  }
  writeFileSync(path, lines.join('\n') + (lines.length ? '\n' : ''));
}

export function readTrecRun(path: string): Map<string, string[]> {
  const run = new Map<string, Array<{ jobId: string; rank: number }>>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const [queryId, , jobId, rank] = parts;
    const list = run.get(queryId) ?? [];
    list.push({ jobId, rank: Number(rank) });
    run.set(queryId, list);
  }
  return new Map(
    [...run].map(([q, list]) => [
      q,
      list.sort((a, b) => a.rank - b.rank).map((x) => x.jobId),
    ]),
  );
}

// TREC qrels format: "<qid> 0 <docid> <grade>".
export function writeQrels(
  path: string,
  judgments: Array<{ queryId: string; jobId: string; grade: number }>,
): void {
  const lines = judgments.map((j) => `${j.queryId} 0 ${j.jobId} ${j.grade}`);
  writeFileSync(path, lines.join('\n') + (lines.length ? '\n' : ''));
}
