import { createHash } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { toVectorFilter } from '../query/job-filters.js';
import {
  CLASSIFIER_VERSION,
  type ClassificationResult,
  type QueryClassifierService,
} from '../query/query-classifier.service.js';
import type { VectorFilter } from '../storage/vector-store/vector-store.interface.js';

export interface CachedClassification {
  key: string;
  model: string;
  classifierVersion: string;
  query: string;
  result: ClassificationResult;
  classifiedAt: string;
}

// Append-only cache of query classifications, keyed by LLM model, classifier
// version and query text. Every evaluation command reads the same entries, so
// retrieval, generation and latency runs apply identical filters.
export class ClassificationCache {
  private readonly byKey = new Map<string, CachedClassification>();
  private readonly used = new Map<string, CachedClassification>();

  constructor(
    private readonly classifier: QueryClassifierService,
    private readonly model: string,
    readonly path = ClassificationCache.defaultPath(model),
  ) {
    if (existsSync(path)) {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const entry = JSON.parse(line) as CachedClassification;
        this.byKey.set(entry.key, entry);
      }
    }
  }

  static defaultPath(model: string): string {
    return resolve(
      process.cwd(),
      '..',
      'evaluation',
      'classifications',
      `${model.replace(/[^a-zA-Z0-9.-]+/g, '_')}.jsonl`,
    );
  }

  get version(): string {
    return CLASSIFIER_VERSION;
  }

  async classify(query: string): Promise<ClassificationResult> {
    const key = createHash('sha256')
      .update([this.model, CLASSIFIER_VERSION, query].join('|'))
      .digest('hex');
    let entry = this.byKey.get(key);
    if (!entry) {
      entry = {
        key,
        model: this.model,
        classifierVersion: CLASSIFIER_VERSION,
        query,
        result: await this.classifier.classify(query, { strict: true }),
        classifiedAt: new Date().toISOString(),
      };
      mkdirSync(dirname(this.path), { recursive: true });
      appendFileSync(this.path, JSON.stringify(entry) + '\n');
      this.byKey.set(key, entry);
    }
    this.used.set(key, entry);
    // Routing rules may have changed since the entry was cached.
    return this.classifier.route(entry.result);
  }

  // The filter production would apply to this query (no request filters).
  async filterFor(query: string): Promise<VectorFilter | undefined> {
    return toVectorFilter((await this.classify(query)).filters);
  }

  // Entries read or written in this process, to copy into a run directory.
  usedEntries(): CachedClassification[] {
    return [...this.used.values()];
  }
}
