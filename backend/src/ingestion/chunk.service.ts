import { Injectable } from '@nestjs/common';
import { RawJobDto } from './dto/raw-job.dto.js';

export interface ChunkInput {
  type: string;
  text: string;
}

/** Structured fields extracted by the LLM parser. Passed alongside RawJobDto. */
export interface StructuredJobData {
  summary?: string | null;
  salary?: string | null;
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
  skills?: string[];
  isRemote?: boolean;
}

const WINDOW_SIZE = 800;
const OVERLAP = 200;
const MAX_WINDOWS = 4;

@Injectable()
export class ChunkService {
  /**
   * Build up to 4 chunks for a job.
   *
   * If structured fields are present (parsed by LLM), builds purpose-built chunks:
   *   1. identity  — title + company + location + jobType + summary
   *   2. requirements — requirements array
   *   3. responsibilities + skills
   *   4. benefits + salary
   *
   * Falls back to text-window strategy over `description` when all structured
   * fields are null/empty (e.g. minimal job postings that the LLM couldn't parse).
   */
  buildChunks(job: RawJobDto, structured?: StructuredJobData): ChunkInput[] {
    const hasStructured = this.hasAnyStructuredContent(structured);

    if (hasStructured && structured) {
      return this.buildStructuredChunks(job, structured);
    }

    return this.buildWindowChunks(job);
  }

  // ── Structured chunk strategy ─────────────────────────────────────────────

  private buildStructuredChunks(
    job: RawJobDto,
    s: StructuredJobData,
  ): ChunkInput[] {
    const chunks: ChunkInput[] = [];

    // 1. Identity (always present)
    chunks.push({ type: 'identity', text: this.buildIdentityText(job, s) });

    // 2. Requirements
    if (s.requirements?.length) {
      chunks.push({
        type: 'requirements',
        text: `Requirements for ${job.title} at ${job.company}: ${s.requirements.join('. ')}`,
      });
    }

    // 3. Responsibilities + Skills
    const hasResponsibilities = (s.responsibilities?.length ?? 0) > 0;
    const hasSkills = (s.skills?.length ?? 0) > 0;
    if (hasResponsibilities || hasSkills) {
      const parts: string[] = [];
      if (hasResponsibilities)
        parts.push(`Responsibilities: ${s.responsibilities!.join('. ')}`);
      if (hasSkills) parts.push(`Skills: ${s.skills!.join(', ')}`);
      chunks.push({ type: 'responsibilities', text: parts.join('. ') });
    }

    // 4. Benefits + Salary
    const hasBenefits = (s.benefits?.length ?? 0) > 0;
    const hasSalary = !!s.salary;
    if (hasBenefits || hasSalary) {
      const parts: string[] = [];
      if (hasBenefits)
        parts.push(`Benefits at ${job.company}: ${s.benefits!.join('. ')}`);
      if (hasSalary) parts.push(`Compensation: ${s.salary}`);
      chunks.push({ type: 'benefits', text: parts.join('. ') });
    }

    return chunks;
  }

  private buildIdentityText(job: RawJobDto, s: StructuredJobData): string {
    const parts = [`${job.title} at ${job.company}`];
    if (job.location) parts.push(`in ${job.location}`);
    else parts.push('Remote');
    const type = job.jobType
      ? `${job.jobType}${s.isRemote ? ', remote' : ''}`
      : s.isRemote
        ? 'remote'
        : null;
    if (type) parts.push(type);
    if (s.summary) parts.push(s.summary);
    return parts.join('. ') + '.';
  }

  // ── Text-window fallback strategy ─────────────────────────────────────────

  private buildWindowChunks(job: RawJobDto): ChunkInput[] {
    const chunks: ChunkInput[] = [];

    // Identity chunk (no summary available)
    const identityParts = [`${job.title} at ${job.company}`];
    if (job.location) identityParts.push(`in ${job.location}`);
    if (job.jobType) identityParts.push(job.jobType);
    chunks.push({ type: 'identity', text: identityParts.join('. ') + '.' });

    if (job.minSalary != null || job.maxSalary != null) {
      const min =
        job.minSalary != null ? `$${job.minSalary.toLocaleString()}` : null;
      const max =
        job.maxSalary != null ? `$${job.maxSalary.toLocaleString()}` : null;
      const range = min && max ? `${min}–${max}` : (min ?? max)!;
      chunks.push({
        type: 'salary',
        text: `${job.title} at ${job.company}. Salary: ${range} per year.`,
      });
    }

    const windows = this.splitText(
      job.description,
      WINDOW_SIZE,
      OVERLAP,
      MAX_WINDOWS,
    );
    if (windows.length > 0) {
      chunks.push({ type: 'requirements', text: windows[0] });
      for (let i = 1; i < windows.length; i++) {
        chunks.push({ type: 'description', text: windows[i] });
      }
    }

    return chunks;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private hasAnyStructuredContent(s?: StructuredJobData): boolean {
    if (!s) return false;
    return !!(
      s.summary ||
      s.salary ||
      (s.responsibilities?.length ?? 0) > 0 ||
      (s.requirements?.length ?? 0) > 0 ||
      (s.benefits?.length ?? 0) > 0 ||
      (s.skills?.length ?? 0) > 0
    );
  }

  /**
   * Splits text into overlapping windows using semantic boundaries.
   * Priority: paragraph breaks → bullet points → sentence endings → hard slice.
   * Exported for unit testing.
   */
  splitText(
    text: string,
    windowSize = WINDOW_SIZE,
    overlap = OVERLAP,
    maxWindows = MAX_WINDOWS,
  ): string[] {
    const segments = this.splitIntoSegments(text);
    const windows: string[] = [];
    let currentWindow = '';
    let i = 0;

    while (i < segments.length && windows.length < maxWindows) {
      const seg = segments[i];

      if ((currentWindow + seg).length <= windowSize) {
        currentWindow += seg;
        i++;
      } else if (currentWindow.length === 0) {
        windows.push(seg.slice(0, windowSize));
        currentWindow = seg.slice(windowSize - overlap);
        i++;
      } else {
        windows.push(currentWindow.trim());
        currentWindow = currentWindow.slice(
          Math.max(0, currentWindow.length - overlap),
        );
      }
    }

    if (currentWindow.trim() && windows.length < maxWindows) {
      windows.push(currentWindow.trim());
    }

    return windows;
  }

  private splitIntoSegments(text: string): string[] {
    const paragraphs = text.split(/\n\n+/);
    const segments: string[] = [];

    for (const para of paragraphs) {
      if (para.length <= WINDOW_SIZE) {
        segments.push(para + '\n\n');
      } else {
        const bullets = para.split(/(?=\n[-•*] )/);
        for (const bullet of bullets) {
          if (bullet.length <= WINDOW_SIZE) {
            segments.push(bullet);
          } else {
            const sentences = bullet.split(/(?<=[.!?])\s+/);
            segments.push(...sentences.map((s) => s + ' '));
          }
        }
      }
    }

    return segments.filter((s) => s.trim().length > 0);
  }
}
