import { Injectable, Logger } from '@nestjs/common';
import { JobProvider, RawJobDto } from '../dto/raw-job.dto';
import { normalizeSalary } from '../salary-normalizer';

const INDUSTRIES: (string | null)[] = [
  null,
  'dev',
  'data-science',
  'design-multimedia',
  'marketing',
  'seo',
  'business',
  'copywriting',
  'accounting-finance',
  'hr',
  'admin-support',
  'engineering',
  'education',
  'legal',
  'healthcare',
];

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobType?: string | string[];
  jobGeo?: string;
  jobDescription: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryPeriod?: string | null;
  salaryCurrency?: string | null;
}

interface JobicyResponse {
  jobs: JobicyJob[];
}

@Injectable()
export class JobicyProvider implements JobProvider {
  private readonly logger = new Logger(JobicyProvider.name);
  private seenIds = new Set<string>();
  private rateLimited = false;

  async fetchJobs(page: number): Promise<RawJobDto[]> {
    if (page === 1) {
      this.seenIds.clear();
      this.rateLimited = false;
    }

    if (this.rateLimited) return [];

    const industry = INDUSTRIES[page - 1];
    const url = new URL('https://jobicy.com/api/v2/remote-jobs');
    url.searchParams.set('count', '50');
    if (industry) url.searchParams.set('industry', industry);

    if (page > 1) await new Promise((r) => setTimeout(r, 300));

    let data: JobicyResponse;
    try {
      const res = await fetch(url.toString());
      if (res.status === 429 || res.status === 403) {
        this.logger.warn(`Jobicy rate limited (${res.status})`);
        this.rateLimited = true;
        return [];
      }
      if (!res.ok) {
        this.logger.warn(`Jobicy returned ${res.status}`);
        return [];
      }
      data = (await res.json()) as JobicyResponse;
    } catch (err) {
      this.logger.warn(`Jobicy fetch error: ${String(err)}`);
      return [];
    }

    const jobs = data.jobs ?? [];

    return jobs
      .map((j) => ({
        sourceId: String(j.id),
        source: 'jobicy' as const,
        title: j.jobTitle,
        company: j.companyName,
        location: j.jobGeo ?? undefined,
        description: this.stripHtml(j.jobDescription ?? ''),
        url: j.url,
        jobType: Array.isArray(j.jobType) ? j.jobType[0] : j.jobType,
        ...normalizeSalary({
          min: j.salaryMin,
          max: j.salaryMax,
          period: j.salaryPeriod,
        }),
      }))
      .filter((j) => {
        if (this.seenIds.has(j.sourceId)) return false;
        if (j.minSalary == null && j.maxSalary == null) return false;
        this.seenIds.add(j.sourceId);
        return true;
      });
  }

  hasNextPage(page: number, results: RawJobDto[]): boolean {
    return !this.rateLimited && page < INDUSTRIES.length && results.length > 0;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
