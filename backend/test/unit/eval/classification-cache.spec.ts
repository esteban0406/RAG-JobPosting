import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ClassificationCache } from '../../../src/eval/classification-cache.js';
import {
  CLASSIFIER_VERSION,
  type QueryClassifierService,
} from '../../../src/query/query-classifier.service.js';

function build(path: string) {
  const classifier = {
    classify: jest.fn().mockResolvedValue({
      type: 'retrieval',
      intent: 'filter_jobs',
      filters: { minSalary: 150000, isRemote: true },
    }),
  };
  const cache = new ClassificationCache(
    classifier as unknown as QueryClassifierService,
    'qwen/qwen3.8-27b',
    path,
  );
  return { cache, classifier };
}

describe('ClassificationCache', () => {
  const path = () =>
    join(mkdtempSync(join(tmpdir(), 'classif-')), 'cache.jsonl');

  it('classifies strictly once per query and persists the result', async () => {
    const file = path();
    const { cache, classifier } = build(file);

    await cache.classify('remote python over 150k');
    await cache.classify('remote python over 150k');

    expect(classifier.classify).toHaveBeenCalledTimes(1);
    expect(classifier.classify).toHaveBeenCalledWith(
      'remote python over 150k',
      { strict: true },
    );
    const [entry] = readFileSync(file, 'utf8').trim().split('\n');
    expect(JSON.parse(entry)).toEqual(
      expect.objectContaining({
        model: 'qwen/qwen3.8-27b',
        classifierVersion: CLASSIFIER_VERSION,
        query: 'remote python over 150k',
      }),
    );
  });

  it('reads earlier classifications back from disk', async () => {
    const file = path();
    await build(file).cache.classify('remote python over 150k');

    const { cache, classifier } = build(file);
    await cache.classify('remote python over 150k');

    expect(classifier.classify).not.toHaveBeenCalled();
    expect(cache.usedEntries()).toHaveLength(1);
  });

  it('maps the cached constraints to the production filter', async () => {
    const { cache } = build(path());

    await expect(cache.filterFor('remote python over 150k')).resolves.toEqual({
      salaryAtLeast: 150000,
      isRemote: true,
    });
  });

  it('does not cache a failed classification', async () => {
    const file = path();
    const { cache, classifier } = build(file);
    classifier.classify.mockRejectedValueOnce(new Error('429'));

    await expect(cache.classify('q')).rejects.toThrow('429');
    await cache.classify('q');

    expect(classifier.classify).toHaveBeenCalledTimes(2);
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(1);
  });
});
