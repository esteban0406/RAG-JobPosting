import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadVariants } from '../../../src/cli/commands/eval-retrieve.command.js';

const file = (content: unknown) => {
  const path = join(mkdtempSync(join(tmpdir(), 'variants-')), 'v.json');
  writeFileSync(path, JSON.stringify(content));
  return path;
};

describe('loadVariants', () => {
  it('reads reranker variants', () => {
    expect(
      loadVariants(file([{ name: 'rr-qwen', fusion: 'rrf', candidates: 20 }])),
    ).toEqual([{ name: 'rr-qwen', fusion: 'rrf', candidates: 20 }]);
  });

  it('rejects names of built-in systems and unknown fusions', () => {
    expect(() => loadVariants(file([{ name: 'bm25' }]))).toThrow('taken');
    expect(() => loadVariants(file([{ name: 'x', fusion: 'max' }]))).toThrow(
      'unknown fusion',
    );
  });
});
