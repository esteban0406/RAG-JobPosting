"""Retrieval metrics and paired significance tests for an eval:retrieve run.

Usage:
    python evaluation/analysis/metrics.py <run dir> --qrels <qrels file>

Writes to <run dir>/analysis-<qrels name>/:
    per_query.csv      one row per (system, query, measure)
    summary.csv        mean per system and measure, overall / by category / by language
                       (overall and by category over information needs; "all-queries"
                       keeps the plain mean over queries for reference)
    significance.csv   dense systems vs. lexical baselines: mean difference,
                       bootstrap 95% CI, paired randomization p-value, Holm-adjusted p
    ladder.csv         the same test between consecutive rungs of the ablation ladder
                       (embedding model, ANN, engine, filters, hybrid, reranking),
                       Holm-adjusted as a separate family

nDCG@10 is the primary measure: Holm corrects only its comparisons, one family
per file. The other measures, including constraint compliance (C@5, C@10, read
from the run's compliance.jsonl), are secondary and keep p_holm empty.

The unit of analysis is the information need: the Spanish queries are
translations of English ones and reuse their judgments, so a need with both
formulations scores the mean of the two. Tests by language use the queries of
that language, where each need appears once.
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
# Share of the top k that meets the query's expected filter (judge-free), only
# for queries that state a constraint; empty when the system returned nothing.
COMPLIANCE = {"C@5": "at5", "C@10": "at10"}
# Fixed before the final run (2026-10-15): Holm over every measure was too
# conservative to read the ladder, so the correction applies to nDCG@10 only.
PRIMARY = "nDCG@10"
BASELINES = ["ilike", "bm25"]
PERMUTATIONS = 10_000
BOOTSTRAP = 10_000
SEED = 42


def load_queries(run_dir: Path) -> pd.DataFrame:
    lines = (run_dir / "queries.jsonl").read_text().splitlines()
    # Same rule as the CLI's loadDataset: "//" lines are comments.
    rows = [json.loads(line) for line in lines if line.strip() and not line.startswith("//")]
    queries = pd.DataFrame(rows).set_index("id")
    # Out-of-domain queries only calibrate the reranker threshold; nothing to score.
    return queries[~queries["category"].isin(["aggregation", "out_of_domain"])]


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


def compliance_scores(run_dir: Path, queries: pd.DataFrame) -> pd.DataFrame:
    path = run_dir / "compliance.jsonl"
    if not path.exists():
        return pd.DataFrame()
    frames = []
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        query_id = row["queryId"]
        if query_id not in queries.index:
            continue
        for name, key in COMPLIANCE.items():
            frames.append(
                {
                    "system": row["system"],
                    "query_id": query_id,
                    "measure": name,
                    # Nothing returned: no share to compute, so the pair drops out.
                    "value": np.nan if row[key] is None else row[key],
                    "category": queries.at[query_id, "category"],
                    "lang": queries.at[query_id, "lang"],
                    "info_need": queries.at[query_id, "infoNeedId"],
                }
            )
    return pd.DataFrame(frames)


def by_need(scores: pd.DataFrame) -> pd.DataFrame:
    """One score per (system, information need, measure): the mean of the need's
    formulations (NaN ones skipped). Fixed before the final run (2026-10-15)."""
    return scores.groupby(["system", "info_need", "measure", "category"], as_index=False)["value"].mean()


def units(scores: pd.DataFrame, subset: str) -> pd.DataFrame:
    """The paired units of a test: information needs overall, queries within a language."""
    if subset == "all":
        needs = by_need(scores)
        return needs.assign(unit=needs["info_need"])
    part = scores[scores["lang"] == subset.split("=")[1]]
    return part.assign(unit=part["query_id"])


def summarize(scores: pd.DataFrame) -> pd.DataFrame:
    needs = by_need(scores)
    parts = [needs.assign(group="all")]
    parts += [needs.assign(group="category=" + needs["category"])]
    parts += [scores.assign(group="all-queries")]
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


def holm_primary(result: pd.DataFrame) -> pd.DataFrame:
    """Holm over the primary measure's comparisons; secondary rows stay empty."""
    result["p_holm"] = np.nan
    if not result.empty:
        primary = result["measure"] == PRIMARY
        result.loc[primary, "p_holm"] = holm(result.loc[primary, "p_value"].tolist())
    return result


# (system, reference, subsets): each rung adds one component to its reference.
# The embedding-model ablation is also tested per language (its hypothesis is
# about Spanish queries).
LADDER = [
    ("qdrant-hnsw", "qdrant-e5base", ["all", "lang=en", "lang=es"]),
    ("pg-hnsw", "pg-exact", ["all"]),
    ("qdrant-hnsw", "pg-hnsw", ["all"]),
    ("qdrant-filtered", "qdrant-hnsw", ["all"]),
    ("qdrant-hybrid", "qdrant-filtered", ["all"]),
    ("qdrant-hybrid-rerank", "qdrant-hybrid", ["all"]),
    ("qdrant-hybrid-rerank", "qdrant-hnsw", ["all"]),
]


def compare(table: pd.DataFrame, system: str, reference: str, rng: np.random.Generator) -> dict | None:
    pair = table[[system, reference]].dropna()
    diff = (pair[system] - pair[reference]).to_numpy()
    if diff.size == 0:
        # e.g. compliance against ILIKE, which returns nothing for constrained queries
        return None
    low, high = bootstrap_ci(diff, rng)
    return {
        "n": diff.size,
        "mean_system": pair[system].mean(),
        "mean_reference": pair[reference].mean(),
        "mean_diff": diff.mean(),
        "ci95_low": low,
        "ci95_high": high,
        "p_value": randomization_test(diff, rng),
    }


def ladder_significance(scores: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    systems = set(scores["system"])
    rows = []
    for measure in [*MEASURES, *COMPLIANCE]:
        measured = scores[scores["measure"] == measure]
        for system, reference, subsets in LADDER:
            if system not in systems or reference not in systems:
                continue
            for subset in subsets:
                table = units(measured, subset).pivot(index="unit", columns="system", values="value")
                result = compare(table, system, reference, rng)
                if result is not None:
                    rows.append({"measure": measure, "system": system, "reference": reference,
                                 "subset": subset, **result})
    return holm_primary(pd.DataFrame(rows))


def significance(scores: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    systems = sorted(scores["system"].unique())
    dense = [s for s in systems if s not in BASELINES]
    rows = []
    for measure in [*MEASURES, *COMPLIANCE]:
        measured = scores[scores["measure"] == measure]
        table = units(measured, "all").pivot(index="unit", columns="system", values="value")
        for system in dense:
            for baseline in [b for b in BASELINES if b in systems]:
                result = compare(table, system, baseline, rng)
                if result is not None:
                    renamed = {("mean_baseline" if k == "mean_reference" else k): v for k, v in result.items()}
                    rows.append({"measure": measure, "system": system, "baseline": baseline, **renamed})
    return holm_primary(pd.DataFrame(rows))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--qrels", type=Path, required=True)
    args = parser.parse_args()

    queries = load_queries(args.run_dir)
    scores = pd.concat([per_query_scores(args.run_dir, args.qrels, queries), compliance_scores(args.run_dir, queries)])
    out = args.run_dir / f"analysis-{args.qrels.stem}"
    out.mkdir(exist_ok=True)
    scores.to_csv(out / "per_query.csv", index=False)
    summary = summarize(scores)
    summary.to_csv(out / "summary.csv", index=False)
    significance(scores).to_csv(out / "significance.csv", index=False)
    ladder_significance(scores).to_csv(out / "ladder.csv", index=False)

    columns = [m for m in [*MEASURES, *COMPLIANCE] if m in summary]
    overall = summary[summary["group"] == "all"].set_index("system")[columns]
    print(overall.round(3).to_string())
    print(f"\nWritten to {out}")


if __name__ == "__main__":
    main()
