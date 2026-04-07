import { Injectable } from '@nestjs/common';
import { RawJobDto } from './dto/raw-job.dto.js';

export interface ChunkInput {
  type: 'identity' | 'salary' | 'requirements' | 'description';
  text: string;
}

const WINDOW_SIZE = 800;
const OVERLAP = 200;
// requirements takes window[0], description takes up to 3 more
const MAX_WINDOWS = 4;

@Injectable()
export class ChunkService {
  buildChunks(job: RawJobDto): ChunkInput[] {
    const chunks: ChunkInput[] = [];

    chunks.push({ type: 'identity', text: this.buildIdentityText(job) });

    if (job.minSalary != null || job.maxSalary != null) {
      chunks.push({ type: 'salary', text: this.buildSalaryText(job) });
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

  private buildIdentityText(job: RawJobDto): string {
    const parts = [`${job.title} at ${job.company}`];
    if (job.location) parts.push(`in ${job.location}`);
    if (job.jobType) parts.push(job.jobType);
    return parts.join('. ') + '.';
  }

  private buildSalaryText(job: RawJobDto): string {
    const min =
      job.minSalary != null ? `$${job.minSalary.toLocaleString()}` : null;
    const max =
      job.maxSalary != null ? `$${job.maxSalary.toLocaleString()}` : null;
    const range = min && max ? `${min}–${max}` : (min ?? max)!;
    return `${job.title} at ${job.company}. Salary: ${range} per year.`;
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
        // Single segment larger than window — hard-slice it
        windows.push(seg.slice(0, windowSize));
        currentWindow = seg.slice(windowSize - overlap);
        i++;
      } else {
        windows.push(currentWindow.trim());
        // Carry overlap from end of current window into next
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
    // Priority 1: paragraph breaks
    const paragraphs = text.split(/\n\n+/);
    const segments: string[] = [];

    for (const para of paragraphs) {
      if (para.length <= WINDOW_SIZE) {
        segments.push(para + '\n\n');
      } else {
        // Priority 2: bullet points
        const bullets = para.split(/(?=\n[-•*] )/);
        for (const bullet of bullets) {
          if (bullet.length <= WINDOW_SIZE) {
            segments.push(bullet);
          } else {
            // Priority 3: sentence boundaries
            const sentences = bullet.split(/(?<=[.!?])\s+/);
            segments.push(...sentences.map((s) => s + ' '));
          }
        }
      }
    }

    return segments.filter((s) => s.trim().length > 0);
  }
}
