import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobProvider, RawJobDto } from '../dto/raw-job.dto.js';

const SOURCE = 'findwork';
const BASE_URL = 'https://findwork.dev/api/jobs/';
const PAGE_SIZE = 50;
const MAX_JOBS = 100;

interface FindworkJob {
  id: string;
  role: string;
  company_name: string;
  company_num_employees: number | null;
  employment_type: string | null;
  location: string | null;
  remote: boolean;
  logo: string;
  url: string;
  text: string;
  date_posted: string;
  keywords: string[];
  source: string;
}

interface FindworkResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: FindworkJob[];
}

@Injectable()
export class FindworkProvider implements JobProvider {
  private readonly logger = new Logger(FindworkProvider.name);
  private readonly apiKey: string;
  private rateLimited = false;
  private seenIds = new Set<string>();
  private totalFetched = 0;
  private hasNextPageFlag = false;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('FINDWORK_API_KEY') ?? '';
  }

  async fetchJobs(page: number): Promise<RawJobDto[]> {
    if (page === 1) {
      this.rateLimited = false;
      this.seenIds.clear();
      this.totalFetched = 0;
      this.hasNextPageFlag = false;
    }

    if (this.rateLimited || !this.apiKey) {
      if (!this.apiKey) this.logger.warn('FINDWORK_API_KEY not set, skipping');
      return [];
    }

    const url = new URL(BASE_URL);
    url.searchParams.set('page', String(page));
    url.searchParams.set('page_size', String(PAGE_SIZE));

    let data: FindworkResponse;
    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Token ${this.apiKey}` },
      });

      if (res.status === 401 || res.status === 403) {
        this.logger.error(
          `Findwork auth error (${res.status}) — check FINDWORK_API_KEY`,
        );
        this.rateLimited = true;
        return [];
      }
      if (res.status === 429) {
        this.logger.warn('Findwork rate limited (429) — stopping');
        this.rateLimited = true;
        return [];
      }
      if (!res.ok) {
        throw new Error(`Findwork API error: ${res.status} ${res.statusText}`);
      }

      data = (await res.json()) as FindworkResponse;
    } catch (err) {
      this.logger.error(`Findwork fetch error: ${(err as Error).message}`);
      return [];
    }

    const jobs = (data.results ?? [])
      .filter((j) => {
        if (!j.role) return false;
        if (this.seenIds.has(j.id)) return false;
        this.seenIds.add(j.id);
        return true;
      })
      .map((j) => ({
        sourceId: j.id,
        source: SOURCE,
        title: j.role,
        company: j.company_name,
        location: j.location ?? undefined,
        description: this.stripHtml(j.text),
        url: j.url,
        jobType: j.employment_type ?? undefined,
        logo: j.logo || undefined,
        keywords: j.keywords ?? [],
      }));

    this.hasNextPageFlag = data.next !== null;
    this.totalFetched += jobs.length;
    return jobs;
  }

  hasNextPage(_page: number, _results: RawJobDto[]): boolean {
    return (
      !this.rateLimited && this.hasNextPageFlag && this.totalFetched < MAX_JOBS
    );
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&ndash;/g, '–')
      .replace(/&mdash;/g, '—')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
