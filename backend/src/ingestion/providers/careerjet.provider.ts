import { Injectable, Logger } from '@nestjs/common';
import { JobProvider, RawJobDto } from '../dto/raw-job.dto.js';
import { normalizeSalary } from '../salary-normalizer.js';

const SOURCE = 'careerjet';
const PAGE_SIZE = 99;
const PAGE_DELAY_MS = 500;

const SALARY_TYPE_MAP: Record<string, string> = {
  Y: 'yearly',
  M: 'monthly',
  W: 'weekly',
  D: 'daily',
  H: 'hourly',
};

const KEYWORDS: string[] = [
  'software developer',
  'data analyst',
  'product manager',
  'UX designer',
  'marketing manager',
  'financial analyst',
  'project manager',
  'sales manager',
  'human resources manager',
  'operations manager',
  'business analyst',
  'content writer',
  'customer success manager',
  'mechanical engineer',
  'healthcare administrator',
];

interface CareerjetJob {
  title: string;
  company: string;
  date: string;
  description: string;
  locations: string;
  salary?: string;
  salary_currency_code?: string;
  salary_max?: number | null;
  salary_min?: number | null;
  salary_type?: string;
  site?: string;
  url: string;
}

interface CareerjetResponse {
  type: string;
  hits?: number;
  pages?: number;
  jobs?: CareerjetJob[];
  message?: string;
}

@Injectable()
export class CareerjetProvider implements JobProvider {
  private readonly logger = new Logger(CareerjetProvider.name);
  private readonly apiKey: string;
  private readonly enabled: boolean;
  private readonly authHeader: string;
  private rateLimited = false;
  private seenIds = new Set<string>();

  constructor() {
    this.apiKey = process.env.CAREERJET_API_KEY ?? '';
    this.enabled = !!this.apiKey;
    if (!this.enabled) {
      this.logger.warn('CAREERJET_API_KEY not set — provider disabled');
    }
    this.authHeader = `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`;
  }

  async fetchJobs(page: number): Promise<RawJobDto[]> {
    if (!this.enabled) return [];

    if (page === 1) {
      this.seenIds.clear();
      this.rateLimited = false;
    }

    if (this.rateLimited) return [];

    const keywordIndex = page - 1;
    if (keywordIndex >= KEYWORDS.length) return [];

    if (page > 1) await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));

    const url = new URL('https://search.api.careerjet.net/v4/query');
    url.searchParams.set('keywords', KEYWORDS[keywordIndex]);
    url.searchParams.set('page_size', String(PAGE_SIZE));
    url.searchParams.set('sort', 'date');
    url.searchParams.set('user_ip', '127.0.0.1');
    url.searchParams.set('user_agent', 'Mozilla/5.0 CareerJetIngestion/1.0');

    this.logger.debug(`Fetching CareerJet: "${KEYWORDS[keywordIndex]}"`);

    let data: CareerjetResponse;
    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: this.authHeader },
      });

      if (res.status === 429) {
        this.logger.warn('CareerJet rate limited (429) — stopping');
        this.rateLimited = true;
        return [];
      }
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`CareerJet request failed (${res.status}): ${body}`);
        return [];
      }

      data = (await res.json()) as CareerjetResponse;
    } catch (err) {
      this.logger.warn(`CareerJet fetch error: ${String(err)}`);
      return [];
    }

    if (data.type !== 'JOBS' || !data.jobs?.length) return [];

    return data.jobs
      .map((j) => this.normalize(j))
      .filter((j) => {
        if (this.seenIds.has(j.sourceId)) return false;
        if (j.minSalary == null && j.maxSalary == null) return false;
        this.seenIds.add(j.sourceId);
        return true;
      });
  }

  hasNextPage(page: number, results: RawJobDto[]): boolean {
    return !this.rateLimited && page < KEYWORDS.length && results.length > 0;
  }

  private normalize(j: CareerjetJob): RawJobDto {
    const period = j.salary_type ? SALARY_TYPE_MAP[j.salary_type] : undefined;
    const hasSalaryNumbers = j.salary_min != null || j.salary_max != null;
    const salary = normalizeSalary(
      hasSalaryNumbers
        ? { min: j.salary_min, max: j.salary_max, period }
        : { raw: j.salary },
    );

    return {
      sourceId: j.url,
      source: SOURCE,
      title: j.title,
      company: j.company ?? 'Unknown',
      location: j.locations,
      description: j.description,
      url: j.url,
      ...salary,
    };
  }
}
