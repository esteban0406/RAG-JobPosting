import {
  Bm25Index,
  normalizeTerm,
  tokenize,
} from '../../../src/eval/systems/bm25.js';

describe('tokenize', () => {
  it('keeps programming-language tokens and drops stopwords', () => {
    expect(tokenize('Senior C++ and C# engineer for the .NET team')).toEqual([
      'senior',
      'c++',
      'c#',
      'engineer',
      '.net',
      'team',
    ]);
  });

  it('folds accents and case', () => {
    expect(tokenize('Ingeniería DE Datos')).toEqual([
      'ingenieria',
      'de',
      'dato',
    ]);
  });

  it('splits dotted names such as node.js', () => {
    expect(tokenize('Node.js developer')).toEqual(['node', 'js', 'developer']);
  });
});

describe('normalizeTerm', () => {
  it('normalizes regular plurals', () => {
    expect(normalizeTerm('engineers')).toBe('engineer');
    expect(normalizeTerm('companies')).toBe('company');
    expect(normalizeTerm('roles')).toBe('role');
  });

  it('leaves short or non-plural terms alone', () => {
    expect(normalizeTerm('aws')).toBe('aws');
    expect(normalizeTerm('business')).toBe('business');
    expect(normalizeTerm('status')).toBe('status');
  });
});

describe('Bm25Index', () => {
  const index = new Bm25Index([
    { id: 'a', text: 'Senior Python engineer, Django and PostgreSQL' },
    { id: 'b', text: 'Frontend engineer, React and TypeScript' },
    { id: 'c', text: 'Python data analyst, pandas, SQL, python scripting' },
    { id: 'd', text: 'Account executive for enterprise sales' },
  ]);

  it('ranks documents that match more query terms higher', () => {
    const hits = index.search('python engineer', 10);
    expect(hits[0].id).toBe('a');
    expect(hits.map((h) => h.id)).toEqual(
      expect.arrayContaining(['a', 'b', 'c']),
    );
    expect(hits.map((h) => h.id)).not.toContain('d');
  });

  it('weights rare terms above common ones', () => {
    expect(index.idf('django')).toBeGreaterThan(index.idf('engineer'));
  });

  it('returns nothing when no term matches and respects k', () => {
    expect(index.search('kubernetes', 10)).toEqual([]);
    expect(index.search('engineer python', 1)).toHaveLength(1);
  });
});
