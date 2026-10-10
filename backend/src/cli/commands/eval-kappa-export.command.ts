import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadDataset } from '../../eval/dataset.js';
import { PROMPT_VERSION, jobCard } from '../../eval/relevance/umbrela.js';
import type { Judgment } from '../../eval/relevance/judgment-store.js';
import { JobRepository } from '../../storage/job.repository.js';
import type { PoolEntry } from './eval-pool.command.js';

export interface KappaExportOptions {
  runDir: string;
  judgmentsFile: string;
  rate: number;
  calibrationShare: number;
  seed: number;
}

// Small deterministic PRNG so the sample is reproducible from the seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// Draws a stratified sample (query category x judge grade) of the judged pool
// and writes it blind: the labeling sheet never shows the judge's grade. A
// separate key file links each sample row back to its pair and split.
export async function evalKappaExport(
  app: INestApplicationContext,
  options: KappaExportOptions,
): Promise<void> {
  const logger = new Logger('eval:kappa-export');
  const random = mulberry32(options.seed);
  const pool = readFileSync(join(options.runDir, 'pool.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as PoolEntry);
  const judgments = new Map<string, Judgment>();
  for (const line of readFileSync(options.judgmentsFile, 'utf8')
    .split('\n')
    .filter(Boolean)) {
    const j = JSON.parse(line) as Judgment;
    if (j.promptVersion === PROMPT_VERSION)
      judgments.set(`${j.infoNeedId}|${j.jobId}`, j);
  }
  const categoryByNeed = new Map(
    loadDataset(join(options.runDir, 'queries.jsonl'))
      .filter((q) => q.lang === 'en')
      .map((q) => [q.infoNeedId, q.category]),
  );

  const strata = new Map<string, PoolEntry[]>();
  for (const entry of pool) {
    const grade = judgments.get(`${entry.infoNeedId}|${entry.jobId}`)?.grade;
    if (grade === undefined || grade < 0) continue;
    const stratum = `${categoryByNeed.get(entry.infoNeedId)}|${grade}`;
    strata.set(stratum, [...(strata.get(stratum) ?? []), entry]);
  }

  const sample: Array<PoolEntry & { split: 'calibration' | 'validation' }> = [];
  for (const [, entries] of [...strata].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const shuffled = [...entries]
      .map((e) => ({ e, r: random() }))
      .sort((x, y) => x.r - y.r)
      .map((x) => x.e);
    const take = shuffled.slice(0, Math.ceil(entries.length * options.rate));
    const calibration = Math.round(take.length * options.calibrationShare);
    take.forEach((e, i) =>
      sample.push({
        ...e,
        split: i < calibration ? 'calibration' : 'validation',
      }),
    );
  }
  // Present rows in random order so strata are not visible while labeling.
  const ordered = sample
    .map((s) => ({ s, r: random() }))
    .sort((x, y) => x.r - y.r)
    .map((x) => x.s);

  const jobs = new Map(
    (
      await app
        .get(JobRepository)
        .findByIds([...new Set(ordered.map((s) => s.jobId))])
    ).map((j) => [j.id, j]),
  );
  const header = [
    'sample_id',
    'split',
    'search_need',
    'job_posting',
    'human_grade_0_3',
    'notes',
  ];
  const rows = ordered.map((s, i) =>
    [String(i + 1), s.split, s.infoNeed, jobCard(jobs.get(s.jobId)!), '', '']
      .map(csvCell)
      .join(','),
  );
  writeFileSync(
    join(options.runDir, 'kappa-sample.csv'),
    [header.join(','), ...rows].join('\n') + '\n',
  );
  writeFileSync(
    join(options.runDir, 'kappa-key.jsonl'),
    ordered
      .map((s, i) =>
        JSON.stringify({
          sampleId: i + 1,
          split: s.split,
          infoNeedId: s.infoNeedId,
          jobId: s.jobId,
        }),
      )
      .join('\n') + '\n',
  );
  const calibration = ordered.filter((s) => s.split === 'calibration').length;
  logger.log(
    `${ordered.length} pairs (${calibration} calibration, ${ordered.length - calibration} validation) from ${strata.size} strata → kappa-sample.csv`,
  );
}
