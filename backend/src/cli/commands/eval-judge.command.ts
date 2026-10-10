import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import PQueue from 'p-queue';
import { loadDataset } from '../../eval/dataset.js';
import {
  createJudge,
  type JudgeConfig,
} from '../../eval/relevance/judge-provider.js';
import {
  JudgmentStore,
  judgmentKey,
} from '../../eval/relevance/judgment-store.js';
import {
  PROMPT_VERSION,
  jobCard,
  parseGrade,
  umbrelaPrompt,
} from '../../eval/relevance/umbrela.js';
import { writeQrels } from '../../eval/trec.js';
import { JobRepository } from '../../storage/job.repository.js';
import type { PoolEntry } from './eval-pool.command.js';

export interface EvalJudgeOptions {
  runDir: string;
  judge: JudgeConfig;
  concurrency: number;
}

const UNPARSEABLE = -1;

function safeName(id: string): string {
  return id.replace(/[^a-zA-Z0-9.-]+/g, '_');
}

// Grades every pooled (information need, job) pair with the LLM judge, reusing
// cached verdicts, and writes TREC qrels for every query in the run.
export async function evalJudge(
  app: INestApplicationContext,
  options: EvalJudgeOptions,
): Promise<string> {
  const logger = new Logger('eval:judge');
  const judge = createJudge(options.judge);
  const store = new JudgmentStore(
    resolve(
      process.cwd(),
      '..',
      'evaluation',
      'judgments',
      `${safeName(judge.id)}.jsonl`,
    ),
  );
  const pool = readFileSync(join(options.runDir, 'pool.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PoolEntry);

  const jobs = new Map(
    (
      await app
        .get(JobRepository)
        .findByIds([...new Set(pool.map((p) => p.jobId))])
    ).map((j) => [j.id, j]),
  );

  const grades = new Map<string, number>();
  let fresh = 0;
  const queue = new PQueue({ concurrency: options.concurrency });
  for (const entry of pool) {
    const job = jobs.get(entry.jobId);
    if (!job)
      throw new Error(
        `Job ${entry.jobId} not found; is this the snapshot database?`,
      );
    const key = judgmentKey({
      judge: judge.id,
      promptVersion: PROMPT_VERSION,
      infoNeed: entry.infoNeed,
      jobId: job.id,
      contentHash: job.contentHash,
    });
    const cached = store.get(key);
    if (cached) {
      grades.set(`${entry.infoNeedId}|${entry.jobId}`, cached.grade);
      continue;
    }
    void queue.add(async () => {
      const prompt = umbrelaPrompt(entry.infoNeed, jobCard(job));
      let raw = await judge.complete(prompt);
      let grade = parseGrade(raw);
      if (grade === null) {
        raw = await judge.complete(prompt);
        grade = parseGrade(raw);
      }
      store.add({
        key,
        judge: judge.id,
        promptVersion: PROMPT_VERSION,
        infoNeedId: entry.infoNeedId,
        jobId: job.id,
        grade: grade ?? UNPARSEABLE,
        raw,
        judgedAt: new Date().toISOString(),
      });
      grades.set(`${entry.infoNeedId}|${entry.jobId}`, grade ?? UNPARSEABLE);
      fresh++;
      if (fresh % 25 === 0) logger.log(`${fresh} new judgments`);
    });
  }
  await queue.onIdle();

  const unparseable = [...grades.values()].filter(
    (g) => g === UNPARSEABLE,
  ).length;
  const queries = loadDataset(join(options.runDir, 'queries.jsonl'));
  const qrels = queries.flatMap((q) =>
    pool
      .filter((p) => p.infoNeedId === q.infoNeedId)
      .map((p) => ({
        queryId: q.id,
        jobId: p.jobId,
        grade: grades.get(`${p.infoNeedId}|${p.jobId}`)!,
      }))
      .filter((j) => j.grade !== UNPARSEABLE),
  );
  const path = join(options.runDir, `qrels.${safeName(judge.id)}.txt`);
  writeQrels(path, qrels);
  logger.log(
    `${pool.length} pairs (${fresh} newly judged, ${unparseable} unparseable) → ${path}`,
  );
  return path;
}
