import { Injectable, Logger } from '@nestjs/common';
import { JobRepository } from '../storage/job.repository.js';
import { QUERIES, QueryDefinition } from './dataset/queries.dataset.js';

export interface CandidateJob {
  id: string;
  title: string;
  description: string;
}

export interface LabeledQuery extends QueryDefinition {
  candidate_job_ids: string[];
  candidate_jobs: CandidateJob[];
  label_count: number;
  label_warning?: string;
}

/**
 * Word-boundary-aware keyword match.
 * - Escapes regex special chars (handles react.js, c#, back-end, spring boot, etc.)
 * - Uses \b as trailing boundary when the last char is a word char (\w),
 *   otherwise uses (?![a-z0-9]) to prevent partial token matches for keywords
 *   ending in non-word chars (e.g. "c#").
 */
function matchKeyword(haystack: string, kw: string): boolean {
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lastChar = kw[kw.length - 1];
  const trailingBoundary = /\w/.test(lastChar) ? '\\b' : '(?![a-z0-9])';
  const pattern = new RegExp(`\\b${escaped}${trailingBoundary}`, 'i');
  return pattern.test(haystack);
}

@Injectable()
export class LabelingService {
  private readonly logger = new Logger(LabelingService.name);

  constructor(private readonly jobRepo: JobRepository) {}

  async labelAll(): Promise<LabeledQuery[]> {
    const jobs = await this.jobRepo.findAll();
    this.logger.debug(`Labeling against ${jobs.length} jobs`);

    return QUERIES.map((q) => {
      const keywords = q.expected_keywords.map((kw) => kw.toLowerCase());
      const maxRelevant: number = q.max_relevant ?? 40;

      // Score each job: 2 pts for title match, 1 pt for description-only.
      // AND logic between keyword_groups is preserved.
      const scored = jobs
        .map((job) => {
          const titleHaystack = job.title.toLowerCase();
          const descHaystack = job.description.toLowerCase();
          let score = 0;

          if (q.keyword_groups && q.keyword_groups.length > 0) {
            const groupScores = q.keyword_groups.map((group) => {
              if (group.some((kw) => matchKeyword(titleHaystack, kw))) return 2;
              if (group.some((kw) => matchKeyword(descHaystack, kw))) return 1;
              return 0;
            });
            // AND logic: every group must contribute at least one match
            if (groupScores.every((s) => s > 0)) {
              score = groupScores.reduce((acc: number, s) => acc + s, 0);
            }
          } else {
            if (keywords.some((kw) => matchKeyword(titleHaystack, kw))) {
              score = 2;
            } else if (keywords.some((kw) => matchKeyword(descHaystack, kw))) {
              score = 1;
            }
          }

          return {
            id: job.id,
            title: job.title,
            description: job.description,
            score,
          };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxRelevant);

      const candidate_job_ids = scored.map((entry) => entry.id);
      const candidate_jobs: CandidateJob[] = scored.map((entry) => ({
        id: entry.id,
        title: entry.title,
        description: entry.description,
      }));
      const label_count = candidate_job_ids.length;

      const label_warning =
        label_count < q.min_relevant
          ? `Only ${label_count} jobs matched (expected >= ${q.min_relevant})`
          : label_count === maxRelevant
            ? `Capped at ${maxRelevant} candidates — consider tuning max_relevant`
            : undefined;

      return {
        ...q,
        candidate_job_ids,
        candidate_jobs,
        label_count,
        label_warning,
      };
    });
  }
}
