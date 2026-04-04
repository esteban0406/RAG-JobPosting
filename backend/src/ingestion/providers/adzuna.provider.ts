import { Injectable, Logger } from '@nestjs/common';
import { JobProvider, RawJobDto } from '../dto/raw-job.dto.js';
import { normalizeSalary } from '../salary-normalizer.js';

const SOURCE = 'adzuna';
const MAX_PAGES = 80; // 40 pages × 20 results = 800 jobs per run
const PAGE_DELAY_MS = 300;

interface AdzunaJob {
  id: string;
  title: string;
  description: string;
  redirect_url: string;
  company: { display_name: string };
  location: { display_name: string };
  contract_time?: string;
  salary_min?: number;
  salary_max?: number;
}

interface AdzunaResponse {
  results: AdzunaJob[];
}

@Injectable()
export class AdzunaProvider implements JobProvider {
  private readonly logger = new Logger(AdzunaProvider.name);
  private readonly appId: string;
  private readonly apiKey: string;
  private readonly enabled: boolean;

  constructor() {
    this.appId = process.env.ADZUNA_APP_ID ?? '';
    this.apiKey = process.env.ADZUNA_API_KEY ?? '';
    this.enabled = !!(this.appId && this.apiKey);
    if (!this.enabled)
      this.logger.warn(
        'ADZUNA_APP_ID or ADZUNA_API_KEY not set — provider disabled',
      );
  }

  async fetchJobs(page: number): Promise<RawJobDto[]> {
    if (!this.enabled) return [];
    if (page > 1) await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));

    const url = new URL(`https://api.adzuna.com/v1/api/jobs/us/search/${page}`);
    url.searchParams.set('app_id', this.appId);
    url.searchParams.set('app_key', this.apiKey);
    url.searchParams.set('results_per_page', '20');

    this.logger.debug(`Fetching Adzuna page ${page}`);
    const res = await fetch(url.toString());

    if (res.status === 403 || res.status === 429) {
      this.logger.warn(`Adzuna rate limited (${res.status}) — stopping`);
      return [];
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Adzuna API error: ${res.status} ${res.statusText} — ${body}`,
      );
    }

    const body = (await res.json()) as AdzunaResponse;
    return (body.results ?? []).map((j) => this.normalize(j));
  }

  hasNextPage(page: number, results: RawJobDto[]): boolean {
    return results.length > 0 && page < MAX_PAGES;
  }

  private normalize(j: AdzunaJob): RawJobDto {
    return {
      sourceId: String(j.id),
      source: SOURCE,
      title: j.title,
      company: j.company?.display_name ?? 'Unknown',
      location: j.location?.display_name,
      description: j.description,
      url: j.redirect_url,
      jobType: j.contract_time,
      ...normalizeSalary({ min: j.salary_min, max: j.salary_max }),
    };
  }
}
