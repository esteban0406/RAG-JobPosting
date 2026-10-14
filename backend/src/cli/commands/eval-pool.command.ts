import { Logger } from '@nestjs/common';
import { readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadDataset } from '../../eval/dataset.js';
import { readTrecRun } from '../../eval/trec.js';

export interface PoolEntry {
  infoNeedId: string;
  infoNeed: string;
  jobId: string;
}

// Depth-k pooling (Sanderson, 2010): the union of every system's top-k jobs,
// grouped by information need so parallel queries share one set of judgments.
export function evalPool(runDir: string, depth: number): string {
  const logger = new Logger('eval:pool');
  const queries = new Map(
    loadDataset(join(runDir, 'queries.jsonl')).map((q) => [q.id, q]),
  );
  const pool = new Map<string, PoolEntry>();

  for (const file of readdirSync(runDir).filter((f) => f.endsWith('.trec'))) {
    for (const [queryId, jobIds] of readTrecRun(join(runDir, file))) {
      const query = queries.get(queryId);
      if (!query) throw new Error(`${file}: query "${queryId}" not in dataset`);
      // Nothing in the corpus answers these, so there is nothing to judge.
      if (query.category === 'out_of_domain') continue;
      for (const jobId of jobIds.slice(0, depth)) {
        pool.set(`${query.infoNeedId}|${jobId}`, {
          infoNeedId: query.infoNeedId,
          infoNeed: query.infoNeed,
          jobId,
        });
      }
    }
  }

  const path = join(runDir, 'pool.jsonl');
  const entries = [...pool.values()];
  writeFileSync(path, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const needs = new Set(entries.map((e) => e.infoNeedId)).size;
  logger.log(
    `${entries.length} pairs across ${needs} information needs → ${path}`,
  );
  return path;
}
