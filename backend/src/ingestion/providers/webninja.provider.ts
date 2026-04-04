import { Injectable, Logger } from '@nestjs/common';
import { JobProvider, RawJobDto } from '../dto/raw-job.dto.js';
import { normalizeSalary } from '../salary-normalizer.js';

const SOURCE = 'webninja';
const QUERY = 'software engineer jobs';
const NUM_PAGES = 40; // aggregated pages per request (10 results/page = 50 total)
const PAGE_DELAY_MS = 500;

interface WebNinjaJob {
  job_id: string;
  job_title: string;
  employer_name: string;
  job_employment_type?: string;
  job_apply_link: string;
  job_description: string | null;
  job_is_remote: boolean;
  job_location?: string;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_period?: string | null;
}

interface WebNinjaResponse {
  status: string;
  parameters: { num_pages: number };
  data: WebNinjaJob[];
}

interface WebNinjaDetailsResponse {
  status: string;
  data: WebNinjaJob[];
}

interface WebNinjaSalaryEntry {
  min_salary: number;
  max_salary: number;
  salary_period: string;
}

interface WebNinjaSalaryResponse {
  status: string;
  data: WebNinjaSalaryEntry[];
}

@Injectable()
export class WebNinjaProvider implements JobProvider {
  private readonly logger = new Logger(WebNinjaProvider.name);
  private readonly apiKey: string;
  private readonly enabled: boolean;

  constructor() {
    this.apiKey = process.env.WEBNINJA_API_KEY ?? '';
    this.enabled = !!this.apiKey;
    if (!this.enabled)
      this.logger.warn('WEBNINJA_API_KEY not set — provider disabled');
  }

  async fetchJobs(page: number): Promise<RawJobDto[]> {
    if (!this.enabled) return [];
    if (page > 1) return []; // all results come in a single aggregated request

    const url = `https://api.openwebninja.com/jsearch/search?query=${encodeURIComponent(QUERY)}&page=1&num_pages=${NUM_PAGES}`;
    this.logger.debug(`Fetching WebNinja (${NUM_PAGES} pages aggregated)`);

    const res = await fetch(url, { headers: { 'x-api-key': this.apiKey } });

    if (res.status === 403 || res.status === 429) {
      this.logger.warn(`WebNinja rate limited (${res.status}) — stopping`);
      return [];
    }
    if (!res.ok)
      throw new Error(`WebNinja API error: ${res.status} ${res.statusText}`);

    const body = (await res.json()) as WebNinjaResponse;

    const results: RawJobDto[] = [];
    for (const j of body.data ?? []) {
      const resolved = await this.resolveJob(j);
      if (resolved) results.push(resolved);
    }
    return results;
  }

  hasNextPage(_page: number, results: RawJobDto[]): boolean {
    return results.length > 0;
  }

  private async resolveJob(j: WebNinjaJob): Promise<RawJobDto | null> {
    let job = j;

    // Step 1: fetch job details if description is missing
    if (!job.job_description) {
      this.logger.log(
        `"${j.job_title}" missing description — fetching job details`,
      );
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
      const detailed = await this.fetchJobDetails(j.job_id);
      if (!detailed || !detailed.job_description) {
        this.logger.log(
          `Skipping "${j.job_title}" — no description after details fetch`,
        );
        return null;
      }
      job = { ...j, ...detailed };
    }

    // Step 2: fetch salary estimate if salary is missing
    if (!job.job_min_salary && !job.job_max_salary) {
      this.logger.log(
        `"${j.job_title}" missing salary — fetching salary estimate`,
      );
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
      const salary = await this.fetchSalaryEstimate(
        j.employer_name,
        j.job_title,
      );
      if (!salary) {
        this.logger.log(
          `Skipping "${j.job_title}" — no salary estimate available`,
        );
        return null;
      }
      job = {
        ...job,
        job_min_salary: salary.min_salary,
        job_max_salary: salary.max_salary,
        job_salary_period: salary.salary_period,
      };
    }

    return this.normalize(job);
  }

  private async fetchJobDetails(jobId: string): Promise<WebNinjaJob | null> {
    const url = `https://api.openwebninja.com/jsearch/job-details?job_id=${encodeURIComponent(jobId)}`;
    const res = await fetch(url, { headers: { 'x-api-key': this.apiKey } });

    if (!res.ok) {
      this.logger.warn(
        `WebNinja job-details HTTP ${res.status} for job_id ${jobId}`,
      );
      return null;
    }

    const body = (await res.json()) as WebNinjaDetailsResponse;
    return body.data?.[0] ?? null;
  }

  private async fetchSalaryEstimate(
    company: string,
    jobTitle: string,
  ): Promise<WebNinjaSalaryEntry | null> {
    const url =
      `https://api.openwebninja.com/jsearch/company-job-salary` +
      `?company=${encodeURIComponent(company)}&job_title=${encodeURIComponent(jobTitle)}`;
    const res = await fetch(url, { headers: { 'x-api-key': this.apiKey } });

    if (!res.ok) {
      this.logger.warn(
        `WebNinja salary HTTP ${res.status} for "${jobTitle}" at "${company}"`,
      );
      return null;
    }

    const body = (await res.json()) as WebNinjaSalaryResponse;
    const entry = body.data?.[0] ?? null;
    if (entry) {
      this.logger.log(
        `Salary estimate for "${jobTitle}" at "${company}": $${entry.min_salary} - $${entry.max_salary} / ${entry.salary_period}`,
      );
    }
    return entry;
  }

  private normalize(j: WebNinjaJob): RawJobDto {
    return {
      sourceId: j.job_id,
      source: SOURCE,
      title: j.job_title,
      company: j.employer_name,
      location: j.job_is_remote ? 'Remote' : (j.job_location ?? undefined),
      description: j.job_description!,
      url: j.job_apply_link,
      jobType: j.job_employment_type,
      ...normalizeSalary({
        min: j.job_min_salary,
        max: j.job_max_salary,
        period: j.job_salary_period ?? undefined,
      }),
    };
  }
}
