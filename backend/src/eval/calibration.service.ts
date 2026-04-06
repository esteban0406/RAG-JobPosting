import { Injectable, Logger } from '@nestjs/common';
import { Verdict } from './judge/judge.interface.js';
import { GeminiJudgeService } from './judge/gemini-judge.service.js';
import { JudgmentCacheService } from './judge/judgment-cache.service.js';
import { OllamaJudgeService } from './judge/ollama-judge.service.js';
import { CandidateJob, LabeledQuery, LabelingService } from './labeling.service.js';

/**
 * Stratified sampling:
 * - TOP: first N candidates per query (highest keyword score) — expect relevant
 * - BOTTOM: last N candidates per query (lowest keyword score) — expect marginal/not_relevant
 * - CROSS: N candidates taken from a *different* query's pool — expect not_relevant
 */
const SAMPLES_PER_TIER = 2;

interface Sample {
  queryId: string;
  query: string;
  jobId: string;
  title: string;
  description: string;
  tier: 'top' | 'bottom' | 'cross';
}

export interface CalibrationDisagreement {
  queryId: string;
  jobTitle: string;
  tier: 'top' | 'bottom' | 'cross';
  local: Verdict;
  gemini: Verdict;
}

export interface CalibrationReport {
  run_at: string;
  sample_size: number;
  agreement_pct: number;
  agreement_by_tier: Record<'top' | 'bottom' | 'cross', { total: number; agreed: number; agreement_pct: number }>;
  confusion_matrix: Record<string, Record<string, number>>;
  disagreements: CalibrationDisagreement[];
}

@Injectable()
export class CalibrationService {
  private readonly logger = new Logger(CalibrationService.name);

  constructor(
    private readonly labelingService: LabelingService,
    private readonly ollamaJudge: OllamaJudgeService,
    private readonly geminiJudge: GeminiJudgeService,
    private readonly judgeCache: JudgmentCacheService,
  ) {}

  async run(): Promise<CalibrationReport> {
    const labeled = await this.labelingService.labelAll();
    const samples = this.buildSamples(labeled);

    this.logger.log(
      `Running calibration on ${samples.length} samples (${SAMPLES_PER_TIER} per tier × 3 tiers × ${labeled.length} queries)`,
    );

    const verdictPairs: { local: Verdict; gemini: Verdict; tier: Sample['tier'] }[] = [];
    const disagreements: CalibrationDisagreement[] = [];

    // Run in sequence — Gemini has rate limits
    for (const sample of samples) {
      const localCached = this.judgeCache.get('ollama', sample.queryId, sample.jobId);
      const local =
        localCached ??
        (await this.ollamaJudge.judge(sample.query, sample.title, sample.description));
      if (!localCached) {
        this.judgeCache.set('ollama', sample.queryId, sample.jobId, local);
      }

      const geminiCached = this.judgeCache.get('gemini', sample.queryId, sample.jobId);
      const gemini =
        geminiCached ??
        (await this.geminiJudge.judge(sample.query, sample.title, sample.description));
      if (!geminiCached) {
        this.judgeCache.set('gemini', sample.queryId, sample.jobId, gemini);
      }

      verdictPairs.push({ local, gemini, tier: sample.tier });

      if (local !== gemini) {
        disagreements.push({
          queryId: sample.queryId,
          jobTitle: sample.title,
          tier: sample.tier,
          local,
          gemini,
        });
      }
    }

    const agreed = verdictPairs.filter((p) => p.local === p.gemini).length;
    const agreement_pct =
      samples.length === 0 ? 0 : Math.round((agreed / samples.length) * 1000) / 1000;

    const agreement_by_tier = this.computeTierStats(verdictPairs);
    const confusion_matrix = this.buildConfusionMatrix(verdictPairs);

    this.logger.log(
      `Calibration complete — agreement=${(agreement_pct * 100).toFixed(1)}% (${agreed}/${samples.length}) | top=${(agreement_by_tier.top.agreement_pct * 100).toFixed(1)}% bottom=${(agreement_by_tier.bottom.agreement_pct * 100).toFixed(1)}% cross=${(agreement_by_tier.cross.agreement_pct * 100).toFixed(1)}%`,
    );

    return {
      run_at: new Date().toISOString(),
      sample_size: samples.length,
      agreement_pct,
      agreement_by_tier,
      confusion_matrix,
      disagreements,
    };
  }

  private buildSamples(labeled: LabeledQuery[]): Sample[] {
    const samples: Sample[] = [];

    for (let i = 0; i < labeled.length; i++) {
      const q = labeled[i];
      const jobs = q.candidate_jobs;

      // TOP: highest-score candidates (first in list)
      for (const job of jobs.slice(0, SAMPLES_PER_TIER)) {
        samples.push(this.toSample(q, job, 'top'));
      }

      // BOTTOM: lowest-score candidates (last in list) — only if enough candidates
      if (jobs.length > SAMPLES_PER_TIER) {
        for (const job of jobs.slice(-SAMPLES_PER_TIER)) {
          samples.push(this.toSample(q, job, 'bottom'));
        }
      }

      // CROSS: candidates from the next query's pool (wrap around)
      const otherQuery = labeled[(i + 1) % labeled.length];
      for (const job of otherQuery.candidate_jobs.slice(0, SAMPLES_PER_TIER)) {
        // Use THIS query's text but a job from a DIFFERENT query — should be not_relevant
        samples.push({
          queryId: q.id,
          query: q.query,
          jobId: `cross_${job.id}`,
          title: job.title,
          description: job.description,
          tier: 'cross',
        });
      }
    }

    return samples;
  }

  private toSample(q: LabeledQuery, job: CandidateJob, tier: Sample['tier']): Sample {
    return {
      queryId: q.id,
      query: q.query,
      jobId: job.id,
      title: job.title,
      description: job.description,
      tier,
    };
  }

  private computeTierStats(
    pairs: { local: Verdict; gemini: Verdict; tier: Sample['tier'] }[],
  ): CalibrationReport['agreement_by_tier'] {
    const tiers: Sample['tier'][] = ['top', 'bottom', 'cross'];
    const result = {} as CalibrationReport['agreement_by_tier'];

    for (const tier of tiers) {
      const group = pairs.filter((p) => p.tier === tier);
      const agreed = group.filter((p) => p.local === p.gemini).length;
      result[tier] = {
        total: group.length,
        agreed,
        agreement_pct:
          group.length === 0
            ? 0
            : Math.round((agreed / group.length) * 1000) / 1000,
      };
    }

    return result;
  }

  private buildConfusionMatrix(
    pairs: { local: Verdict; gemini: Verdict }[],
  ): Record<string, Record<string, number>> {
    const verdicts: Verdict[] = ['relevant', 'marginal', 'not_relevant'];
    const matrix: Record<string, Record<string, number>> = {};

    for (const local of verdicts) {
      matrix[local] = {};
      for (const gemini of verdicts) {
        matrix[local][gemini] = 0;
      }
    }

    for (const { local, gemini } of pairs) {
      matrix[local][gemini]++;
    }

    return matrix;
  }
}
