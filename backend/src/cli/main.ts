import { NestFactory } from '@nestjs/core';
import { parseArgs } from 'util';
import { CliModule } from './cli.module.js';
import { annQuick } from './commands/ann-quick.command.js';
import { evalGenerate } from './commands/eval-generate.command.js';
import { evalJudge } from './commands/eval-judge.command.js';
import { evalKappaExport } from './commands/eval-kappa-export.command.js';
import { evalPool } from './commands/eval-pool.command.js';
import {
  SYSTEM_NAMES,
  evalRetrieve,
} from './commands/eval-retrieve.command.js';
import { qdrantBackfill } from './commands/qdrant-backfill.command.js';

const USAGE = `Usage: pnpm cli <command> [options]

Commands:
  qdrant:backfill [--recreate] [--batch-size 500]
      Copy all JobChunk vectors from Postgres into Qdrant and verify counts.
  ann:quick [--queries 200] [--k 10] [--ef 16,64,256] [--repetitions 3]
      Recall@k vs. exact search and latency for pgvector and Qdrant HNSW.
  eval:retrieve --dataset <queries.jsonl> [--systems a,b] [--depth 10] [--ef-search 40] [--label name]
      Run the retrieval systems and write TREC runs to evaluation/runs/.
  eval:pool --run <run dir> [--depth 10]
      Pool the systems' top results per information need.
  eval:judge --run <run dir> [--judge-provider openai-compatible|anthropic]
             [--judge-model llama3.1:8b] [--judge-base-url URL] [--concurrency 2]
      Grade the pool with an LLM judge (API key from JUDGE_API_KEY) and write qrels.
  eval:generate --dataset <queries.jsonl> [--label name] [--temperature 0] [--delay-ms 2000] [--limit n]
      Answer the retrieval queries through the RAG path; cache answers, record timings.
  eval:kappa-export --run <run dir> --judgments <judge.jsonl> [--rate 0.2] [--calibration-share 0.25] [--seed 42]
      Blind, stratified sample of judged pairs for manual labeling (Cohen's kappa).`;

function required(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`Missing required option ${flag}`);
  return value;
}

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
      dataset: { type: 'string' },
      systems: { type: 'string', default: SYSTEM_NAMES.join(',') },
      depth: { type: 'string', default: '10' },
      'ef-search': { type: 'string', default: '40' },
      label: { type: 'string', default: 'run' },
      run: { type: 'string' },
      'judge-provider': { type: 'string', default: 'openai-compatible' },
      'judge-model': { type: 'string', default: 'llama3.1:8b' },
      'judge-base-url': { type: 'string' },
      concurrency: { type: 'string', default: '2' },
      temperature: { type: 'string', default: '0' },
      'delay-ms': { type: 'string', default: '2000' },
      limit: { type: 'string' },
      judgments: { type: 'string' },
      rate: { type: 'string', default: '0.2' },
      'calibration-share': { type: 'string', default: '0.25' },
      seed: { type: 'string', default: '42' },
      help: { type: 'boolean', default: false },
    },
  });

  const command = positionals[0];
  if (!command || values.help) {
    console.log(USAGE);
    return command ? 0 : 1;
  }

  // Pure file-processing commands need no database or application context.
  if (command === 'eval:pool') {
    evalPool(required(values.run, '--run'), Number(values.depth));
    return 0;
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
      case 'eval:retrieve':
        await evalRetrieve(app, {
          dataset: required(values.dataset, '--dataset'),
          systems: values.systems.split(','),
          depth: Number(values.depth),
          efSearch: Number(values['ef-search']),
          label: values.label,
        });
        return 0;
      case 'eval:judge':
        await evalJudge(app, {
          runDir: required(values.run, '--run'),
          judge: {
            provider:
              values['judge-provider'] === 'anthropic'
                ? 'anthropic'
                : 'openai-compatible',
            model: values['judge-model'],
            baseUrl: values['judge-base-url'],
            apiKey: process.env.JUDGE_API_KEY,
          },
          concurrency: Number(values.concurrency),
        });
        return 0;
      case 'eval:generate':
        await evalGenerate(app, {
          dataset: required(values.dataset, '--dataset'),
          label: values.label,
          temperature: Number(values.temperature),
          delayMs: Number(values['delay-ms']),
          limit: values.limit ? Number(values.limit) : undefined,
        });
        return 0;
      case 'eval:kappa-export':
        await evalKappaExport(app, {
          runDir: required(values.run, '--run'),
          judgmentsFile: required(values.judgments, '--judgments'),
          rate: Number(values.rate),
          calibrationShare: Number(values['calibration-share']),
          seed: Number(values.seed),
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
