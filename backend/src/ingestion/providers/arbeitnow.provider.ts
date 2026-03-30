import { Injectable, Logger } from '@nestjs/common';
import { JobProvider, RawJobDto } from '../dto/raw-job.dto.js';

const BASE_URL = 'https://www.arbeitnow.com/api/job-board-api';
const SOURCE = 'arbeitnow';
const PAGE_DELAY_MS = 300;

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  job_types: string[];
  location: string;
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[];
}

@Injectable()
export class ArbeitnowProvider implements JobProvider {
  private readonly logger = new Logger(ArbeitnowProvider.name);

  async fetchJobs(page: number): Promise<RawJobDto[]> {
    const url = `${BASE_URL}?page=${page}`;
    this.logger.debug(`Fetching Arbeitnow page ${page}`);

    if (page > 1) {
      await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'job-posting-rag-bot/1.0' },
    });

    if (res.status === 403 || res.status === 429) {
      this.logger.warn(
        `Arbeitnow rate-limited on page ${page} (${res.status}) — stopping pagination`,
      );
      return [];
    }

    if (!res.ok) {
      throw new Error(`Arbeitnow API error: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as ArbeitnowResponse;
    return body.data.map((job) => this.normalize(job));
  }

  hasNextPage(_page: number, results: RawJobDto[]): boolean {
    return results.length > 0;
  }

  private normalize(job: ArbeitnowJob): RawJobDto {
    return {
      sourceId: job.slug,
      source: SOURCE,
      title: job.title,
      company: job.company_name,
      location: job.remote ? 'Remote' : (job.location ?? undefined),
      description: this.stripHtml(job.description),
      url: job.url,
      jobType: job.job_types?.[0] ?? undefined,
    };
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
