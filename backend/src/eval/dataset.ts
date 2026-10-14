import { readFileSync } from 'fs';
import type { TemplateKey } from '../query/aggregation/query-templates.js';
import type { VectorFilter } from '../storage/vector-store/vector-store.interface.js';

export type QueryCategory =
  | 'exact'
  | 'semantic_vocab_mismatch'
  | 'constraint'
  | 'noisy'
  | 'aggregation'
  // No posting answers it; only for calibrating the no-results threshold.
  | 'out_of_domain';

export const QUERY_CATEGORIES: QueryCategory[] = [
  'exact',
  'semantic_vocab_mismatch',
  'constraint',
  'noisy',
  'aggregation',
  'out_of_domain',
];

export interface EvalQuery {
  id: string;
  // Relevance is judged per information need, so parallel queries in other
  // languages share the judgments of the English query.
  infoNeedId: string;
  infoNeed: string;
  text: string;
  lang: 'en' | 'es';
  category: QueryCategory;
  expectedRoute?: 'retrieval' | 'aggregation' | 'hybrid';
  // Aggregation queries: the templates a correct router picks (the closest in
  // the catalog when none returns the answer directly; some are
  // interchangeable) and a hand-written reference query.
  expectedTemplates?: TemplateKey[];
  goldSql?: string;
  // The vector-store filter production should apply to this query ({} when
  // the query states no salary, remote or job-type constraint). Used to score
  // constraint extraction; absent means not scored.
  expectedFilters?: VectorFilter;
}

const FILTER_KEYS = new Set([
  'minSalary',
  'maxSalary',
  'salaryAtLeast',
  'jobType',
  'isRemote',
]);

function checkFilter(filter: unknown, line: number): void {
  if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) {
    throw new Error(`Line ${line}: expectedFilters must be an object`);
  }
  for (const [key, value] of Object.entries(filter)) {
    const valid =
      key === 'isRemote'
        ? typeof value === 'boolean'
        : key === 'jobType'
          ? typeof value === 'string' ||
            (Array.isArray(value) && value.every((v) => typeof v === 'string'))
          : typeof value === 'number' && value > 0;
    if (!FILTER_KEYS.has(key) || !valid) {
      throw new Error(`Line ${line}: invalid expectedFilters.${key}`);
    }
  }
}

// Order-insensitive equality of two filters; undefined counts as {}.
export function sameFilter(a?: VectorFilter, b?: VectorFilter): boolean {
  const canonical = (f?: VectorFilter) =>
    JSON.stringify(
      Object.entries(f ?? {})
        .filter(([, v]) => v !== undefined)
        .map(([k, v]: [string, unknown]) => [
          k,
          Array.isArray(v) ? v.map(String).sort() : v,
        ])
        .sort(([x], [y]) => String(x).localeCompare(String(y))),
    );
  return canonical(a) === canonical(b);
}

export function loadDataset(path: string): EvalQuery[] {
  const queries = readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'))
    .map((line, i) => {
      const q = JSON.parse(line) as EvalQuery;
      for (const field of [
        'id',
        'infoNeedId',
        'infoNeed',
        'text',
        'lang',
        'category',
      ] as const) {
        if (!q[field]) throw new Error(`Line ${i + 1}: missing "${field}"`);
      }
      if (!QUERY_CATEGORIES.includes(q.category)) {
        throw new Error(`Line ${i + 1}: unknown category "${q.category}"`);
      }
      if (q.expectedFilters !== undefined)
        checkFilter(q.expectedFilters, i + 1);
      return q;
    });

  const ids = new Set<string>();
  for (const q of queries) {
    if (ids.has(q.id)) throw new Error(`Duplicate query id "${q.id}"`);
    ids.add(q.id);
  }
  return queries;
}
