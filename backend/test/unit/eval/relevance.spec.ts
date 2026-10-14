import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { evalPool } from '../../../src/cli/commands/eval-pool.command.js';
import { loadDataset, sameFilter } from '../../../src/eval/dataset.js';
import {
  JudgmentStore,
  judgmentKey,
} from '../../../src/eval/relevance/judgment-store.js';
import {
  jobCard,
  parseGrade,
  umbrelaPrompt,
} from '../../../src/eval/relevance/umbrela.js';
import { readTrecRun, writeTrecRun } from '../../../src/eval/trec.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'eval-'));

const query = (id: string, infoNeedId: string, extra = {}) =>
  JSON.stringify({
    id,
    infoNeedId,
    infoNeed: `need ${infoNeedId}`,
    text: `query ${id}`,
    lang: 'en',
    category: 'exact',
    ...extra,
  });

describe('UMBRELA judge prompt', () => {
  it('parses the final score and rejects other output', () => {
    expect(parseGrade('##final score: 2')).toBe(2);
    expect(parseGrade('M: 3, T: 2\n## Final Score: 3')).toBe(3);
    expect(parseGrade('3')).toBe(3);
    expect(parseGrade('I cannot decide')).toBeNull();
    expect(parseGrade('##final score: 7')).toBeNull();
  });

  it('builds a job card with explicit gaps and a bounded description', () => {
    const card = jobCard({
      id: 'j1',
      title: 'Data Engineer',
      company: 'Acme',
      location: null,
      jobType: 'full_time',
      isRemote: true,
      minSalary: 100000,
      maxSalary: null,
      skills: [],
      summary: null,
      description: 'x'.repeat(5000),
      contentHash: 'h',
    });
    expect(card).toContain('Location: not stated');
    expect(card).toContain('Salary: 100000 - ? USD/year');
    expect(card).toContain('Skills: not stated');
    expect(card.length).toBeLessThan(1800);
    expect(umbrelaPrompt('remote data jobs', card)).toContain(
      'Search need: remote data jobs',
    );
  });

  it('caps postings that miss a hard condition at category 1', () => {
    const prompt = umbrelaPrompt('remote data jobs over 150k', 'card');
    expect(prompt).toContain(
      'or does not state the attribute, can receive at most category 1',
    );
    expect(prompt).toContain('Seniority and skills are not hard conditions');
  });
});

describe('judgment cache', () => {
  it('keys on judge, prompt version, need, job and content', () => {
    const base = {
      judge: 'ollama:llama3.1:8b',
      promptVersion: 'v1',
      infoNeed: 'need',
      jobId: 'j1',
      contentHash: 'h1',
    };
    expect(judgmentKey(base)).toBe(judgmentKey({ ...base }));
    expect(judgmentKey(base)).not.toBe(
      judgmentKey({ ...base, judge: 'other' }),
    );
    expect(judgmentKey(base)).not.toBe(
      judgmentKey({ ...base, contentHash: 'h2' }),
    );
  });

  it('persists appended judgments across instances', () => {
    const path = join(tmp(), 'judge.jsonl');
    const store = new JudgmentStore(path);
    store.add({
      key: 'k1',
      judge: 'j',
      promptVersion: 'v1',
      infoNeedId: 'n1',
      jobId: 'job',
      grade: 2,
      raw: '##final score: 2',
      judgedAt: 'now',
    });
    expect(new JudgmentStore(path).get('k1')?.grade).toBe(2);
  });
});

describe('TREC runs and pooling', () => {
  it('round-trips a run file in rank order', () => {
    const path = join(tmp(), 'bm25.trec');
    writeTrecRun(
      path,
      'bm25',
      new Map([
        [
          'q1',
          [
            { jobId: 'a', score: 2 },
            { jobId: 'b', score: 1 },
          ],
        ],
      ]),
    );
    expect(readFileSync(path, 'utf8')).toContain('q1 Q0 a 1 2.000000 bm25');
    expect(readTrecRun(path).get('q1')).toEqual(['a', 'b']);
  });

  it('pools by information need so parallel queries share judgments', () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'queries.jsonl'),
      [
        query('en1', 'n1'),
        query('es1', 'n1', { lang: 'es' }),
        query('en2', 'n2'),
      ].join('\n'),
    );
    writeTrecRun(
      join(dir, 'a.trec'),
      'a',
      new Map([
        ['en1', [{ jobId: 'j1', score: 1 }]],
        ['es1', [{ jobId: 'j2', score: 1 }]],
        ['en2', [{ jobId: 'j1', score: 1 }]],
      ]),
    );
    writeTrecRun(
      join(dir, 'b.trec'),
      'b',
      new Map([['en1', [{ jobId: 'j1', score: 1 }]]]),
    );

    const pool = readFileSync(evalPool(dir, 10), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { infoNeedId: string; jobId: string });

    expect(pool).toHaveLength(3);
    expect(
      pool
        .filter((p) => p.infoNeedId === 'n1')
        .map((p) => p.jobId)
        .sort(),
    ).toEqual(['j1', 'j2']);
  });
});

describe('loadDataset', () => {
  it('rejects unknown categories and duplicate ids', () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'bad.jsonl'),
      query('q1', 'n1', { category: 'weird' }),
    );
    expect(() => loadDataset(join(dir, 'bad.jsonl'))).toThrow(
      'unknown category',
    );
    writeFileSync(
      join(dir, 'dup.jsonl'),
      [query('q1', 'n1'), query('q1', 'n2')].join('\n'),
    );
    expect(() => loadDataset(join(dir, 'dup.jsonl'))).toThrow('Duplicate');
  });

  it('accepts valid expectedFilters and rejects invalid ones', () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'ok.jsonl'),
      query('q1', 'n1', {
        expectedFilters: { jobType: ['contract', 'freelance'], isRemote: true },
      }),
    );
    expect(loadDataset(join(dir, 'ok.jsonl'))[0].expectedFilters).toEqual({
      jobType: ['contract', 'freelance'],
      isRemote: true,
    });
    for (const bad of [{ isRemote: 'yes' }, { city: 'Austin' }, []]) {
      writeFileSync(
        join(dir, 'bad.jsonl'),
        query('q1', 'n1', { expectedFilters: bad }),
      );
      expect(() => loadDataset(join(dir, 'bad.jsonl'))).toThrow(
        'expectedFilters',
      );
    }
  });
});

describe('sameFilter', () => {
  it('ignores key order, array order and undefined values', () => {
    expect(
      sameFilter(
        { isRemote: true, jobType: ['freelance', 'contract'] },
        {
          jobType: ['contract', 'freelance'],
          isRemote: true,
          maxSalary: undefined,
        },
      ),
    ).toBe(true);
  });

  it('treats a missing filter as an empty one', () => {
    expect(sameFilter({}, undefined)).toBe(true);
    expect(sameFilter({ isRemote: true }, undefined)).toBe(false);
  });
});
