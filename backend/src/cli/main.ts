import { NestFactory } from '@nestjs/core';
import { parseArgs } from 'util';
import { CliModule } from './cli.module.js';
import { annQuick } from './commands/ann-quick.command.js';
import { qdrantBackfill } from './commands/qdrant-backfill.command.js';

const USAGE = `Usage: pnpm cli <command> [options]

Commands:
  qdrant:backfill [--recreate] [--batch-size 500]
      Copy all JobChunk vectors from Postgres into Qdrant and verify counts.
  ann:quick [--queries 200] [--k 10] [--ef 16,64,256] [--repetitions 3]
      Recall@k vs. exact search and latency for pgvector and Qdrant HNSW.`;

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      recreate: { type: 'boolean', default: false },
      'batch-size': { type: 'string', default: '500' },
      queries: { type: 'string', default: '200' },
      k: { type: 'string', default: '10' },
      ef: { type: 'string', default: '16,64,256' },
      repetitions: { type: 'string', default: '3' },
      help: { type: 'boolean', default: false },
    },
  });

  const command = positionals[0];
  if (!command || values.help) {
    console.log(USAGE);
    return command ? 0 : 1;
  }

  const app = await NestFactory.createApplicationContext(CliModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    switch (command) {
      case 'qdrant:backfill':
        return (await qdrantBackfill(app, {
          recreate: values.recreate,
          batchSize: Number(values['batch-size']),
        }))
          ? 0
          : 1;
      case 'ann:quick':
        await annQuick(app, {
          queries: Number(values.queries),
          k: Number(values.k),
          efValues: values.ef.split(',').map(Number),
          repetitions: Number(values.repetitions),
        });
        return 0;
      default:
        console.error(`Unknown command: ${command}\n\n${USAGE}`);
        return 1;
    }
  } finally {
    await app.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err: Error) => {
    console.error(err);
    process.exit(1);
  },
);
