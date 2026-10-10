// Okapi BM25 over an in-memory corpus (Robertson & Zaragoza, 2009), with the
// Lucene IDF variant so scores stay positive for very common terms.

export interface Bm25Options {
  k1: number;
  b: number;
}

export interface Bm25Hit {
  id: string;
  score: number;
}

const STOPWORDS = new Set(
  (
    'a an and are as at be but by for from has have in into is it its of on or ' +
    'our that the their this to was we were will with you your'
  ).split(' '),
);

// Light plural normalization (S-stemmer style): enough to match "engineers"
// with "engineer" without the over-stemming of a full Porter stemmer.
export function normalizeTerm(term: string): string {
  if (term.length <= 3 || /[^a-z]/.test(term)) return term;
  if (term.endsWith('ies') && !/(eies|aies)$/.test(term)) {
    return term.slice(0, -3) + 'y';
  }
  if (term.endsWith('es') && !/(aes|ees|oes)$/.test(term)) {
    return term.slice(0, -1);
  }
  if (term.endsWith('s') && !/(us|ss)$/.test(term)) return term.slice(0, -1);
  return term;
}

// Lowercases, strips accents and keeps tokens such as "c++", "c#" and ".net".
export function tokenize(text: string): string[] {
  const folded = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const tokens = folded.match(/\.?[a-z0-9]+[+#]*/g) ?? [];
  return tokens
    .map((t) => (t.startsWith('.') && t !== '.net' ? t.slice(1) : t))
    .filter((t) => !STOPWORDS.has(t))
    .map(normalizeTerm);
}

export class Bm25Index {
  private readonly ids: string[] = [];
  private readonly lengths: number[] = [];
  private readonly postings = new Map<string, Map<number, number>>();
  private avgLength = 0;

  constructor(
    documents: Array<{ id: string; text: string }>,
    private readonly options: Bm25Options = { k1: 1.2, b: 0.75 },
  ) {
    for (const doc of documents) {
      const index = this.ids.length;
      const terms = tokenize(doc.text);
      this.ids.push(doc.id);
      this.lengths.push(terms.length);
      for (const term of terms) {
        let posting = this.postings.get(term);
        if (!posting) {
          posting = new Map();
          this.postings.set(term, posting);
        }
        posting.set(index, (posting.get(index) ?? 0) + 1);
      }
    }
    const total = this.lengths.reduce((a, b) => a + b, 0);
    this.avgLength = this.ids.length > 0 ? total / this.ids.length : 0;
  }

  get size(): number {
    return this.ids.length;
  }

  idf(term: string): number {
    const df = this.postings.get(term)?.size ?? 0;
    const n = this.ids.length;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  search(query: string, k: number): Bm25Hit[] {
    const { k1, b } = this.options;
    const scores = new Map<number, number>();
    for (const term of new Set(tokenize(query))) {
      const posting = this.postings.get(term);
      if (!posting) continue;
      const idf = this.idf(term);
      for (const [doc, tf] of posting) {
        const norm = 1 - b + b * (this.lengths[doc] / this.avgLength);
        const weight = idf * ((tf * (k1 + 1)) / (tf + k1 * norm));
        scores.set(doc, (scores.get(doc) ?? 0) + weight);
      }
    }
    return Array.from(scores.entries())
      .sort((x, y) => y[1] - x[1] || x[0] - y[0])
      .slice(0, k)
      .map(([doc, score]) => ({ id: this.ids[doc], score }));
  }
}
