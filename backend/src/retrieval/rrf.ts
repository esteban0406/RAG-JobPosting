// Reciprocal rank fusion (Cormack, Clarke & Büttcher, 2009): each list adds
// 1 / (k + rank) for every item it contains, with ranks starting at 1. Only
// ranks are used, so dense similarities and BM25 scores need no calibration.
export const RRF_K = 60;

export interface FusedItem {
  id: string;
  score: number;
}

// Ties keep first-seen order, so the earlier list (dense) wins them.
export function fuseRrf(lists: string[][], k = RRF_K): FusedItem[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, i) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1));
    });
  }
  return Array.from(scores, ([id, score]) => ({ id, score })).sort(
    (a, b) => b.score - a.score,
  );
}
