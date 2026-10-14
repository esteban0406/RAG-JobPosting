import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plausibleSalary } from '../../ingestion/salary-normalizer.js';
import { PrismaService } from '../../storage/prisma.service.js';
import { PgVectorStore } from '../../storage/vector-store/pgvector.store.js';
import { QdrantVectorStore } from '../../storage/vector-store/qdrant.store.js';
import { withOverrides } from '../run-context.js';

export interface CleanSalariesOptions {
  // Qdrant collections whose payloads carry the job salary.
  collections: string[];
  dryRun: boolean;
}

// Applies plausibleSalary (the rule ingestion now uses) to every stored job,
// so the frozen corpus gets the same cleaning as new postings: implausible
// values become "not stated" in Postgres and in the Qdrant payloads.
export async function jobsCleanSalaries(
  app: INestApplicationContext,
  options: CleanSalariesOptions,
): Promise<boolean> {
  const logger = new Logger('jobs:clean-salaries');
  const prisma = app.get(PrismaService);
  const config = app.get(ConfigService);

  const jobs = await prisma.job.findMany({
    select: { id: true, title: true, minSalary: true, maxSalary: true },
  });
  const changes = jobs
    .map((job) => {
      const clean = plausibleSalary(job);
      return {
        job,
        minSalary: clean.minSalary ?? null,
        maxSalary: clean.maxSalary ?? null,
      };
    })
    .filter(
      (c) => c.minSalary !== c.job.minSalary || c.maxSalary !== c.job.maxSalary,
    );

  for (const c of changes) {
    logger.log(
      `${c.job.title}: ${c.job.minSalary}–${c.job.maxSalary} → ${c.minSalary}–${c.maxSalary}`,
    );
  }
  logger.log(`${changes.length} of ${jobs.length} jobs to clean`);
  if (options.dryRun || changes.length === 0) return true;

  const stores = options.collections.map(
    (collection) =>
      new QdrantVectorStore(
        app.get(PgVectorStore),
        withOverrides(config, { QDRANT_COLLECTION: collection }),
      ),
  );
  for (const c of changes) {
    const salary = { minSalary: c.minSalary, maxSalary: c.maxSalary };
    await prisma.job.update({ where: { id: c.job.id }, data: salary });
    for (const store of stores) await store.setJobSalary(c.job.id, salary);
  }

  const remaining = (
    await prisma.job.findMany({ select: { minSalary: true, maxSalary: true } })
  ).filter((j) => {
    const clean = plausibleSalary(j);
    return (
      (clean.minSalary ?? null) !== j.minSalary ||
      (clean.maxSalary ?? null) !== j.maxSalary
    );
  }).length;
  logger.log(
    `Cleaned ${changes.length} jobs in Postgres and ${stores.length} Qdrant collection(s); ${remaining} implausible left`,
  );
  return remaining === 0;
}
