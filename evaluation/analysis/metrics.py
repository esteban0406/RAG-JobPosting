"""Retrieval metrics and paired significance tests for an eval:retrieve run.

Usage:
    python evaluation/analysis/metrics.py <run dir> --qrels <qrels file>

Writes to <run dir>/analysis-<qrels name>/:
    per_query.csv      one row per (system, query, measure)
    summary.csv        mean per system and measure, overall / by category / by language
    significance.csv   dense systems vs. lexical baselines: mean difference,
                       bootstrap 95% CI, paired randomization p-value, Holm-adjusted p
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import ir_measures
import numpy as np
import pandas as pd
from ir_measures import P, R, RR, nDCG

# Binary measures count a job as relevant from grade 2 ("satisfies the main
# part of the need") upward; nDCG uses the graded labels directly.
MEASURES = {
    "P@5": P(rel=2) @ 5,
    "P@10": P(rel=2) @ 10,
    "nDCG@10": nDCG @ 10,
    "MRR": RR(rel=2),
    "R@10": R(rel=2) @ 10,
}
BASELINES = ["ilike", "bm25"]
PERMUTATIONS = 10_000
BOOTSTRAP = 10_000
SEED = 42


def load_queries(run_dir: Path) -> pd.DataFrame:
    lines = (run_dir / "queries.jsonl").read_text().splitlines()
    # Same rule as the CLI's loadDataset: "//" lines are comments.
    rows = [json.loads(line) for line in lines if line.strip() and not line.startswith("//")]
    queries = pd.DataFrame(rows).set_index("id")
    return queries[queries["category"] != "aggregation"]


def per_query_scores(run_dir: Path, qrels_path: Path, queries: pd.DataFrame) -> pd.DataFrame:
    qrels = list(ir_measures.read_trec_qrels(str(qrels_path)))
    relevant = {q.query_id for q in qrels if q.relevance >= 2}
    frames = []
    for run_file in sorted(run_dir.glob("*.trec")):
        run = list(ir_measures.read_trec_run(str(run_file)))
        scores = {
            (m.query_id, str(m.measure)): m.value
            for m in ir_measures.iter_calc(list(MEASURES.values()), qrels, run)
        }
        for query_id in queries.index:
            for name, measure in MEASURES.items():
                value = scores.get((query_id, str(measure)))
                if value is None:
                    # A system that returns nothing scores 0, except recall,
                    # which is undefined when the query has no relevant job.
                    value = np.nan if name.startswith("R@") and query_id not in relevant else 0.0
                frames.append(
                    {
                        "system": run_file.stem,
                        "query_id": query_id,
                        "measure": name,
                        "value": value,
                        "category": queries.at[query_id, "category"],
                        "lang": queries.at[query_id, "lang"],
                        "info_need": queries.at[query_id, "infoNeedId"],
                    }
                )
    return pd.DataFrame(frames)


def summarize(scores: pd.DataFrame) -> pd.DataFrame:
    parts = [scores.assign(group="all")]
    parts += [scores.assign(group="category=" + scores["category"])]
    parts += [scores.assign(group="lang=" + scores["lang"])]
    # English queries of the needs that also have a Spanish query, so the two
    # languages are compared on the same information needs.
    es_needs = set(scores.loc[scores["lang"] == "es", "info_need"])
    parallel = scores[(scores["lang"] == "en") & scores["info_need"].isin(es_needs)]
    parts += [parallel.assign(group="lang=en-parallel")]
    combined = pd.concat(parts)
    return (
        combined.groupby(["group", "system", "measure"])["value"]
        .agg(mean="mean", n="count")
        .reset_index()
        .pivot_table(index=["group", "system"], columns="measure", values="mean")
        .reset_index()
    )


def randomization_test(diff: np.ndarray, rng: np.random.Generator) -> float:
    """Two-sided paired randomization (sign-flip) test on the mean difference."""
    observed = abs(diff.mean())
    signs = rng.choice([-1.0, 1.0], size=(PERMUTATIONS, diff.size))
    permuted = np.abs((signs * diff).mean(axis=1))
    return (np.sum(permuted >= observed) + 1) / (PERMUTATIONS + 1)


def bootstrap_ci(diff: np.ndarray, rng: np.random.Generator) -> tuple[float, float]:
    samples = rng.choice(diff, size=(BOOTSTRAP, diff.size), replace=True).mean(axis=1)
    low, high = np.percentile(samples, [2.5, 97.5])
    return float(low), float(high)


def holm(pvalues: list[float]) -> list[float]:
    order = np.argsort(pvalues)
    m = len(pvalues)
    adjusted = np.empty(m)
    running = 0.0
    for rank, idx in enumerate(order):
        running = max(running, (m - rank) * pvalues[idx])
        adjusted[idx] = min(1.0, running)
    return adjusted.tolist()


def significance(scores: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    systems = sorted(scores["system"].unique())
    dense = [s for s in systems if s not in BASELINES]
    rows = []
    for measure in MEASURES:
        table = scores[scores["measure"] == measure].pivot(index="query_id", columns="system", values="value")
        for system in dense:
            for baseline in [b for b in BASELINES if b in systems]:
                pair = table[[system, baseline]].dropna()
                diff = (pair[system] - pair[baseline]).to_numpy()
                low, high = bootstrap_ci(diff, rng)
                rows.append(
                    {
                        "measure": measure,
                        "system": system,
                        "baseline": baseline,
                        "n": diff.size,
                        "mean_system": pair[system].mean(),
                        "mean_baseline": pair[baseline].mean(),
                        "mean_diff": diff.mean(),
                        "ci95_low": low,
                        "ci95_high": high,
                        "p_value": randomization_test(diff, rng),
                    }
                )
    result = pd.DataFrame(rows)
    if not result.empty:
        result["p_holm"] = holm(result["p_value"].tolist())
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--qrels", type=Path, required=True)
    args = parser.parse_args()

    queries = load_queries(args.run_dir)
    scores = per_query_scores(args.run_dir, args.qrels, queries)
    out = args.run_dir / f"analysis-{args.qrels.stem}"
    out.mkdir(exist_ok=True)
    scores.to_csv(out / "per_query.csv", index=False)
    summary = summarize(scores)
    summary.to_csv(out / "summary.csv", index=False)
    significance(scores).to_csv(out / "significance.csv", index=False)

    overall = summary[summary["group"] == "all"].set_index("system")[list(MEASURES)]
    print(overall.round(3).to_string())
    print(f"\nWritten to {out}")


if __name__ == "__main__":
    main()
