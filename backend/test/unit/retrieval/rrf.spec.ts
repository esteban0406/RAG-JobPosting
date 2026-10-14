import { fuseRrf } from '../../../src/retrieval/rrf.js';

describe('fuseRrf', () => {
  it('sums 1 / (k + rank) over the lists that contain an item', () => {
    const fused = fuseRrf(
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
      60,
    );
    const score = Object.fromEntries(fused.map((f) => [f.id, f.score]));
    expect(score.a).toBeCloseTo(1 / 61);
    expect(score.b).toBeCloseTo(1 / 62 + 1 / 61);
    expect(score.c).toBeCloseTo(1 / 62);
    expect(fused.map((f) => f.id)).toEqual(['b', 'a', 'c']);
  });

  it('breaks ties in favour of the earlier list', () => {
    expect(fuseRrf([['dense'], ['lexical']]).map((f) => f.id)).toEqual([
      'dense',
      'lexical',
    ]);
  });

  it('returns an empty list for empty input', () => {
    expect(fuseRrf([[], []])).toEqual([]);
  });
});
