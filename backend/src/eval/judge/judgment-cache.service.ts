import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { Verdict } from './judge.interface.js';

const CACHE_FILE = join(process.cwd(), 'eval-judgments.json');
const FLUSH_DEBOUNCE_MS = 5_000;

@Injectable()
export class JudgmentCacheService implements OnModuleInit {
  private readonly logger = new Logger(JudgmentCacheService.name);
  private cache = new Map<string, Verdict>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  async onModuleInit() {
    if (existsSync(CACHE_FILE)) {
      try {
        const raw = await readFile(CACHE_FILE, 'utf-8');
        const entries = JSON.parse(raw) as [string, Verdict][];
        this.cache = new Map(entries);
        this.logger.log(
          `Loaded ${this.cache.size} cached judgments from ${CACHE_FILE}`,
        );
      } catch {
        this.logger.warn(
          'Could not parse eval-judgments.json — starting fresh',
        );
      }
    }
  }

  private key(judgeType: string, queryId: string, jobId: string): string {
    return `${judgeType}:${queryId}:${jobId}`;
  }

  get(judgeType: string, queryId: string, jobId: string): Verdict | undefined {
    return this.cache.get(this.key(judgeType, queryId, jobId));
  }

  set(
    judgeType: string,
    queryId: string,
    jobId: string,
    verdict: Verdict,
  ): void {
    this.cache.set(this.key(judgeType, queryId, jobId), verdict);
    this.schedulFlush();
  }

  has(judgeType: string, queryId: string, jobId: string): boolean {
    return this.cache.has(this.key(judgeType, queryId, jobId));
  }

  stats(): { total: number; byJudge: Record<string, number> } {
    const byJudge: Record<string, number> = {};
    for (const key of this.cache.keys()) {
      const judge = key.split(':')[0];
      byJudge[judge] = (byJudge[judge] ?? 0) + 1;
    }
    return { total: this.cache.size, byJudge };
  }

  async clear(): Promise<void> {
    this.cache.clear();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (existsSync(CACHE_FILE)) {
      await unlink(CACHE_FILE);
    }
    this.logger.log('Judgment cache cleared');
  }

  private schedulFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    try {
      const entries = Array.from(this.cache.entries());
      await writeFile(CACHE_FILE, JSON.stringify(entries), 'utf-8');
      this.logger.debug(`Flushed ${entries.length} judgments to ${CACHE_FILE}`);
    } catch (err) {
      this.logger.error(
        `Failed to flush judgment cache: ${(err as Error).message}`,
      );
    }
  }
}
