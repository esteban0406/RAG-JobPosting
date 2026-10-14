import { readFileSync } from 'fs';
import type { TemplateKey } from '../query/aggregation/query-templates.js';

export type QueryCategory =
  | 'exact'
  | 'semantic_vocab_mismatch'
  | 'constraint'
  | 'noisy'
  | 'aggregation';

export const QUERY_CATEGORIES: QueryCategory[] = [
  'exact',
  'semantic_vocab_mismatch',
  'constraint',
  'noisy',
  'aggregation',
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
      return q;
    });

  const ids = new Set<string>();
  for (const q of queries) {
    if (ids.has(q.id)) throw new Error(`Duplicate query id "${q.id}"`);
    ids.add(q.id);
  }
  return queries;
}
