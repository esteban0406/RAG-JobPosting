import { createHash } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';

export interface Judgment {
  key: string;
  judge: string;
  promptVersion: string;
  infoNeedId: string;
  jobId: string;
  grade: number;
  raw: string;
  judgedAt: string;
}

export function judgmentKey(parts: {
  judge: string;
  promptVersion: string;
  infoNeed: string;
  jobId: string;
  contentHash: string;
}): string {
  return createHash('sha256')
    .update(
      [
        parts.judge,
        parts.promptVersion,
        parts.infoNeed,
        parts.jobId,
        parts.contentHash,
      ].join('|'),
    )
    .digest('hex');
}

// Append-only JSONL cache: verdicts are never rewritten, so every number in
// the thesis can be traced to the exact judge output that produced it.
export class JudgmentStore {
  private readonly byKey = new Map<string, Judgment>();

  constructor(private readonly path: string) {
    if (existsSync(path)) {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const judgment = JSON.parse(line) as Judgment;
        this.byKey.set(judgment.key, judgment);
      }
    }
  }

  get(key: string): Judgment | undefined {
    return this.byKey.get(key);
  }

  add(judgment: Judgment): void {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, JSON.stringify(judgment) + '\n');
    this.byKey.set(judgment.key, judgment);
  }

  get size(): number {
    return this.byKey.size;
  }
}
