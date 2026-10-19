import { NestFactory } from '@nestjs/core';
import { parseArgs } from 'util';
import { CliModule } from './cli.module.js';
import { annQuick } from './commands/ann-quick.command.js';
import { embeddingsReembed } from './commands/embeddings-reembed.command.js';
import { jobsCleanSalaries } from './commands/jobs-clean-salaries.command.js';
import { evalAggregation } from './commands/eval-aggregation.command.js';
import { evalGenerate } from './commands/eval-generate.command.js';
import { evalJudge } from './commands/eval-judge.command.js';
import { evalKappaExport } from './commands/eval-kappa-export.command.js';
import { evalLatency } from './commands/eval-latency.command.js';
import { evalPool } from './commands/eval-pool.command.js';
import {
  SYSTEM_NAMES,
  evalRetrieve,
} from './commands/eval-retrieve.command.js';
import { qdrantBackfill } from './commands/qdrant-backfill.command.js';

const USAGE = `Usage: pnpm cli <command> [options]

Commands:
  embeddings:reembed [--batch-size 500]
      Re-embed every JobChunk in place with LOCAL_EMBEDDING_MODEL (same ids and
      texts) and rebuild the HNSW index; then run qdrant:backfill --recreate.
  jobs:clean-salaries [--collections a,b] [--dry-run]
      Apply the plausible-salary rule (10k-1M USD/year, min <= max) to stored
      jobs and to the salary in the given Qdrant collections' payloads.
  qdrant:backfill [--recreate] [--batch-size 500]
      Copy all JobChunk vectors from Postgres into Qdrant and verify counts.
  ann:quick [--queries 200] [--k 10] [--ef 16,64,256] [--repetitions 3]
      Recall@k vs. exact search and latency for pgvector and Qdrant HNSW.
  eval:retrieve --dataset <queries.jsonl> [--systems a,b] [--depth 10] [--ef-search 40] [--label name]
                [--ablation-collection eval_job_chunks_e5base] [--ablation-embed-url http://localhost:8001]
                [--variants rerank-variants.json]
      Run the retrieval systems and write TREC runs to evaluation/runs/. Filtered
      systems classify each query once (evaluation/classifications/ cache).
  eval:pool --run <run dir> [--depth 10]
      Pool the systems' top results per information need.
  eval:judge --run <run dir> [--judge-provider openai-compatible|anthropic]
             [--judge-model llama3.1:8b] [--judge-base-url URL] [--concurrency 2]
             [--judge-temperature 0|none] [--judge-reasoning-effort none] [--judge-thinking between_tools]
      Grade the pool with an LLM judge (API key from JUDGE_API_KEY) and write qrels.
      Final judge: --judge-base-url https://api.openai.com/v1 --judge-model gpt-4o.
      Plan B: --judge-provider anthropic --judge-model claude-sonnet-5-5
              --judge-temperature none --judge-thinking between_tools.
  eval:generate --dataset <queries.jsonl> [--label name] [--temperature 0] [--delay-ms 2000] [--limit n]
      Answer the retrieval queries through the RAG path; cache answers, record timings.
  eval:kappa-export --run <run dir> --judgments <judge.jsonl> [--rate 0.2] [--calibration-share 0.25] [--seed 42]
      Blind, stratified sample of judged pairs for manual labeling (Cohen's kappa).
  eval:latency --dataset <queries.jsonl> [--label name] [--warmup 5] [--repetitions 30]
               [--generation-queries 30] [--generation-repetitions 3] [--delay-ms 2000] [--seed 42]
      Per-stage latency of the RAG path with the configured VECTOR_BACKEND.
  eval:aggregation --dataset <queries.jsonl> [--label name] [--delay-ms 2000]
      Routing accuracy and result rows vs. the reference SQL for aggregation queries.`;

// "none" omits the temperature (models that reject sampling parameters).
function judgeTemperature(value: string): number | null {
  if (value === 'none') return null;
  const temperature = Number(value);
  if (Number.isNaN(temperature))
    throw new Error(
      `--judge-temperature must be a number or "none", got "${value}"`,
    );
  return temperature;
}
function required(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`Missing required option ${flag}`);
  return value;
}

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      recreate: { type: 'boolean', default: false },
      collections: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'batch-size': { type: 'string', default: '500' },
      queries: { type: 'string', default: '200' },
      k: { type: 'string', default: '10' },
      ef: { type: 'string', default: '16,64,256' },
      // ann:quick defaults to 3, eval:latency to 30.
      repetitions: { type: 'string' },
      warmup: { type: 'string', default: '5' },
      'generation-queries': { type: 'string', default: '30' },
      'generation-repetitions': { type: 'string', default: '3' },
      dataset: { type: 'string' },
      systems: { type: 'string', default: SYSTEM_NAMES.join(',') },
      depth: { type: 'string', default: '10' },
      'ef-search': { type: 'string', default: '40' },
      'ablation-collection': {
        type: 'string',
        default: 'eval_job_chunks_e5base',
      },
      variants: { type: 'string' },
      'ablation-embed-url': {
        type: 'string',
        default: 'http://localhost:8001',
      },
      label: { type: 'string', default: 'run' },
      run: { type: 'string' },
      'judge-provider': { type: 'string', default: 'openai-compatible' },
      'judge-model': { type: 'string', default: 'llama3.1:8b' },
      'judge-base-url': { type: 'string' },
      'judge-temperature': { type: 'string', default: '0' },
      'judge-reasoning-effort': { type: 'string' },
      'judge-thinking': { type: 'string' },
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

  // Latency is timed per attempt: the Groq SDK must not retry rate-limited
  // requests on its own, or its wait would be counted as time to first token.
  if (command === 'eval:latency') process.env.LLM_MAX_RETRIES = '0';

  const app = await NestFactory.createApplicationContext(CliModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    switch (command) {
      case 'embeddings:reembed':
        return (await embeddingsReembed(app, {
          batchSize: Number(values['batch-size']),
        }))
          ? 0
          : 1;
      case 'jobs:clean-salaries':
        return (await jobsCleanSalaries(app, {
          collections: (
            values.collections ??
            process.env.QDRANT_COLLECTION ??
            'job_chunks'
          )
            .split(',')
            .filter(Boolean),
          dryRun: values['dry-run'],
        }))
          ? 0
          : 1;
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
          repetitions: Number(values.repetitions ?? '3'),
        });
        return 0;
      case 'eval:retrieve':
        await evalRetrieve(app, {
          dataset: required(values.dataset, '--dataset'),
          systems: values.systems.split(','),
          depth: Number(values.depth),
          efSearch: Number(values['ef-search']),
          label: values.label,
          ablationCollection: values['ablation-collection'],
          ablationEmbedUrl: values['ablation-embed-url'],
          variants: values.variants,
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
            temperature: judgeTemperature(values['judge-temperature']),
            reasoningEffort: values['judge-reasoning-effort'],
            thinking: values['judge-thinking'],
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
      case 'eval:latency':
        await evalLatency(app, {
          dataset: required(values.dataset, '--dataset'),
          label: values.label,
          warmup: Number(values.warmup),
          repetitions: Number(values.repetitions ?? '30'),
          generationQueries: Number(values['generation-queries']),
          generationRepetitions: Number(values['generation-repetitions']),
          temperature: Number(values.temperature),
          delayMs: Number(values['delay-ms']),
          seed: Number(values.seed),
        });
        return 0;
      case 'eval:aggregation':
        await evalAggregation(app, {
          dataset: required(values.dataset, '--dataset'),
          label: values.label,
          delayMs: Number(values['delay-ms']),
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
