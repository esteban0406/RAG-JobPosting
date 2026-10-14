import type { Logger } from '@nestjs/common';

const RATE_LIMIT_WAIT_MS = 60_000;
const MAX_RATE_LIMIT_RETRIES = 10;

export function isRateLimited(err: unknown): boolean {
  const e = err as { status?: number; getStatus?: () => number };
  return e.status === 429 || e.getStatus?.() === 429;
}

// Runs fn, waiting out the hosted LLM's rate limits (HTTP 429) and starting
// over from scratch, so timings never include a wait.
export async function retryRateLimited<T>(
  fn: () => Promise<T>,
  logger: Logger,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimited(err) || attempt >= MAX_RATE_LIMIT_RETRIES) throw err;
      logger.warn(`Rate limited; retrying in ${RATE_LIMIT_WAIT_MS / 1000}s`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS));
    }
  }
}
