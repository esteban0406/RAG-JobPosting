import { Injectable, Logger } from '@nestjs/common';
import { JobRepository } from '../storage/job.repository.js';
import {
  QUERIES,
  QueryCategory,
  QueryDefinition,
} from './dataset/queries.dataset.js';

export interface LabeledQuery extends QueryDefinition {
  relevant_job_ids: string[];
  label_count: number;
  label_warning?: string;
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

      const relevant_job_ids = jobs
        .filter((job) => {
          const haystack = `${job.title} ${job.description}`.toLowerCase();
          if (q.keyword_groups && q.keyword_groups.length > 0) {
            // AND between groups, OR within each group
            return q.keyword_groups.every((group) =>
              group.some((kw) => haystack.includes(kw.toLowerCase())),
            );
          }
          return keywords.some((kw) => haystack.includes(kw));
        })
        .map((job) => job.id);

      const label_count = relevant_job_ids.length;
      const label_warning =
        label_count < q.min_relevant
          ? `Only ${label_count} jobs matched (expected >= ${q.min_relevant})`
          : undefined;

      return {
        ...q,
        relevant_job_ids,
        label_count,
        label_warning,
      } as LabeledQuery & { category: QueryCategory };
    });
  }
}
