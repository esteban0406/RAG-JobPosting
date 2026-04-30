import { Injectable, Logger } from '@nestjs/common';
import { JobProvider, RawJobDto } from '../dto/raw-job.dto.js';
import { normalizeSalary } from '../salary-normalizer.js';
import { normalizeJobType } from './normalize-job-type.js';

const SOURCE = 'remotive';
const MAX_LIMIT = 100;
const CATEGORY_DELAY_MS = 300;

// null = general endpoint (no category filter); strings = specific categories
const CATEGORIES: (string | null)[] = [
  null,
  'software-development',
  'customer-service',
  'design',
  'marketing',
  'sales-business',
  'product',
  'project-management',
  'ai-ml',
  'data',
  'devops',
  'finance',
  'human-resources',
  'qa',
  'writing',
  'legal',
  'medical',
  'education',
  'all-others',
];

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  job_type?: string;
  candidate_required_location?: string;
  salary?: string;
  description: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

@Injectable()
export class RemotiveProvider implements JobProvider {
  private readonly logger = new Logger(RemotiveProvider.name);
  private rateLimited = false;
  private seenIds = new Set<string>();

  async fetchJobs(page: number): Promise<RawJobDto[]> {
    if (page === 1) {
      this.rateLimited = false;
      this.seenIds.clear();
    }

    const categoryIndex = page - 1;
    if (categoryIndex >= CATEGORIES.length || this.rateLimited) return [];

    if (page > 1) await new Promise((r) => setTimeout(r, CATEGORY_DELAY_MS));

    const category = CATEGORIES[categoryIndex];
    this.logger.debug(`Fetching Remotive jobs for: ${category ?? 'general'}`);

    const url = category
      ? `https://remotive.com/api/remote-jobs?category=${category}&limit=${MAX_LIMIT}`
      : `https://remotive.com/api/remote-jobs?limit=${MAX_LIMIT}`;
    const res = await fetch(url);

    if (res.status === 403 || res.status === 429) {
      this.logger.warn(
        `Remotive rate limited (${res.status}) on ${category ?? 'general'} — stopping`,
      );
      this.rateLimited = true;
      return [];
    }
    if (!res.ok)
      throw new Error(`Remotive API error: ${res.status} ${res.statusText}`);

    const body = (await res.json()) as RemotiveResponse;

    return (body.jobs ?? [])
      .map((j) => ({
        sourceId: String(j.id),
        source: SOURCE,
        title: j.title,
        company: j.company_name,
        location: j.candidate_required_location,
        description: this.stripHtml(j.description),
        url: j.url,
        jobType:
          normalizeJobType(j.job_type !== 'remote' ? j.job_type : null) ??
          undefined,
        isRemote:
          j.job_type === 'remote' ||
          j.candidate_required_location?.toLowerCase().includes('remote')
            ? true
            : undefined,
        ...normalizeSalary({ raw: j.salary }),
      }))
      .filter((j) => {
        if (this.seenIds.has(j.sourceId)) return false;
        if (j.minSalary == null && j.maxSalary == null) return false;
        this.seenIds.add(j.sourceId);
        return true;
      });
  }

  hasNextPage(page: number, _: RawJobDto[]): boolean {
    return !this.rateLimited && page <= CATEGORIES.length;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
