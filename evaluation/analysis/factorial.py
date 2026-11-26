"""2x2x2 factorial over the pipeline's filters (F), hybrid search (H) and
reranking (R), on nDCG@10 per information need (post hoc, descriptive).

Usage:
    python evaluation/analysis/factorial.py <retrieve run dir> --judge <qrels name> [--judge ...]

The eight cells are systems of the run: qdrant-hnsw has none of the three
components (dense search ranked like the pipeline), and the other seven add
them in every combination. The ablation ladder adds them in a fixed order and
cannot show interactions; here each main effect is the mean of the four cells
with the component minus the four without it, and each interaction is the
usual +/- contrast (Yates order), all over information needs as in
metrics.py. 95% bootstrap CIs and two-sided paired randomization (sign-flip)
p-values, Holm-adjusted within each judge as one family, declared after the
first results. Writes <run dir>/analysis-qrels.<judge>/factorial.csv.
"""

from __future__ import annotations

import argparse
import itertools
from pathlib import Path

import numpy as np
import pandas as pd

MEASURE = "nDCG@10"
# (filters, hybrid, rerank) -> system
CELLS = {
    (0, 0, 0): "qdrant-hnsw",
    (1, 0, 0): "qdrant-filtered",
    (0, 1, 0): "qdrant-hybrid-nofilter",
    (0, 0, 1): "qdrant-rerank-nofilter",
    (1, 1, 0): "qdrant-hybrid",
    (1, 0, 1): "qdrant-filtered-rerank",
    (0, 1, 1): "qdrant-hybrid-rerank-nofilter",
    (1, 1, 1): "qdrant-hybrid-rerank",
}
FACTORS = ["F", "H", "R"]
PERMUTATIONS = 10_000
BOOTSTRAP = 10_000
SEED = 42


def holm(pvalues: list[float]) -> list[float]:
    order = np.argsort(pvalues)
    m = len(pvalues)
    adjusted = np.empty(m)
    running = 0.0
    for rank, idx in enumerate(order):
        running = max(running, (m - rank) * pvalues[idx])
        adjusted[idx] = min(1.0, running)
    return adjusted.tolist()


def effects(analysis: Path) -> pd.DataFrame:
    scores = pd.read_csv(analysis / "per_query.csv")
    scores = scores[(scores["measure"] == MEASURE) & scores["system"].isin(CELLS.values())]
    # One score per information need: the mean of its formulations (metrics.py).
    needs = scores.groupby(["system", "info_need"])["value"].mean().unstack("system")
    missing = set(CELLS.values()) - set(needs.columns)
    if missing:
        raise SystemExit(f"{analysis}: missing systems {sorted(missing)}")
    rng = np.random.default_rng(SEED)
    rows = []
    for size in (1, 2, 3):
        for combo in itertools.combinations(range(3), size):
            # Contrast sign of each cell: product of +1/-1 over the factors in the effect.
            signs = {cell: np.prod([1 if cell[i] else -1 for i in combo]) for cell in CELLS}
            diff = sum(signs[cell] * needs[system] for cell, system in CELLS.items()) / 4
            values = diff.to_numpy()
            observed = abs(values.mean())
            flips = rng.choice([-1.0, 1.0], size=(PERMUTATIONS, values.size))
            p = (np.sum(np.abs((flips * values).mean(axis=1)) >= observed) + 1) / (PERMUTATIONS + 1)
            boot = rng.choice(values, size=(BOOTSTRAP, values.size), replace=True).mean(axis=1)
            low, high = np.percentile(boot, [2.5, 97.5])
            rows.append(
                {
                    "effect": "x".join(FACTORS[i] for i in combo),
                    "needs": values.size,
                    "estimate": values.mean(),
                    "ci_low": low,
                    "ci_high": high,
                    "p": p,
                }
            )
    result = pd.DataFrame(rows)
    result["p_holm"] = holm(result["p"].tolist())
    cells = pd.DataFrame(
        [{"cell": "".join(f for f, on in zip(FACTORS, cell) if on) or "D", "system": system,
          "mean": needs[system].mean()} for cell, system in CELLS.items()]
    )
    return result, cells


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--judge", action="append", required=True, help="qrels name, e.g. api.openai.com_gpt-6-sol_reasoning_none")
    args = parser.parse_args()
    for judge in args.judge:
        analysis = args.run_dir / f"analysis-qrels.{judge}"
        result, cells = effects(analysis)
        result.to_csv(analysis / "factorial.csv", index=False)
        cells.to_csv(analysis / "factorial-cells.csv", index=False)
        print(f"== {judge}")
        print(cells.round(3).to_string(index=False))
        print(result.round(3).to_string(index=False))


if __name__ == "__main__":
    main()
