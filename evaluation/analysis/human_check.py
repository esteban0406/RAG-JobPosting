"""Retrieval checks with the human relevance labels only (no LLM judge).

Usage:
    python evaluation/analysis/human_check.py <retrieve run dir> \
        [--kappa-run <run with kappa-sample.csv and kappa-key.jsonl>] \
        [--judgments evaluation/judgments/api.openai.com_gpt-6-sol_reasoning_none.jsonl]

Two questions the LLM judge cannot answer about itself:

1. Does the reranker still help when only human labels count? nDCG@10 on the
   condensed list (Sakai, 2007: unlabeled jobs are removed and the rest move
   up), per query and then per information need, as metrics.py does. The same
   is computed with the judge's grades on exactly the same pairs, so the two
   differ only in who labeled them.
2. Does the judge agree less with the human on the jobs the reranker promotes
   than on the ones it demotes? (An LLM judge could favour what a neural
   reranker favours; Fröbe et al., 2025.)

The labels are the 401 pairs of the judge validation sample: 298 validation
(primary: never shown next to a judge) and 103 calibration (relabeled after
seeing disagreements with the judges, so secondary). The sample was drawn from
the pool of the run of 2026-10-14, stratified by category and judge grade, so
the share of each grade is not the pool's; a job counts as relevant from
grade 2. Writes <run dir>/human-check/{summary.csv,comparisons.csv,
disagreement.csv,report.json}.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import ir_measures
import numpy as np
import pandas as pd
from ir_measures import nDCG

RUNS = Path("evaluation/runs")
KAPPA_RUN = RUNS / "2026-10-14T19-15-49-565eff3-retrieve-test-full"
JUDGMENTS = Path("evaluation/judgments/api.openai.com_gpt-6-sol_reasoning_none.jsonl")
PROMPT_VERSION = "umbrela-jobs-v2"
CONDENSED = nDCG(judged_only=True) @ 10
DEPTH = 10
PERMUTATIONS = 10_000
BOOTSTRAP = 10_000
SEED = 42
# (system, reference): what the reranker adds in each configuration, and the
# full pipeline against BM25.
COMPARISONS = [
    ("qdrant-hybrid-rerank", "qdrant-hybrid"),
    ("qdrant-filtered-rerank", "qdrant-filtered"),
    ("bm25-filtered-rerank", "bm25-filtered"),
    ("qdrant-rerank-nofilter", "qdrant-hnsw"),
    ("qdrant-hybrid-rerank", "bm25"),
    ("qdrant-hybrid-rerank", "bm25-filtered"),
]
# Rerank step whose promoted and demoted jobs are compared (question 2).
RERANK_STEP = ("qdrant-hybrid", "qdrant-hybrid-rerank")


def load_queries(run_dir: Path) -> pd.DataFrame:
    lines = (run_dir / "queries.jsonl").read_text().splitlines()
    rows = [json.loads(line) for line in lines if line.strip() and not line.startswith("//")]
    queries = pd.DataFrame(rows).set_index("id")
    return queries[~queries["category"].isin(["aggregation", "out_of_domain"])]


def load_labels(kappa_run: Path, judgments: Path) -> pd.DataFrame:
    """One row per labeled (information need, job): split, human and judge grade."""
    key = {
        str(row["sampleId"]): row
        for row in (json.loads(l) for l in (kappa_run / "kappa-key.jsonl").read_text().splitlines() if l.strip())
    }
    rows = []
    with open(kappa_run / "kappa-sample.csv", newline="") as fh:
        for row in csv.DictReader(fh):
            k = key[row["sample_id"]]
            rows.append(
                {
                    "info_need": k["infoNeedId"],
                    "job": k["jobId"],
                    "split": k["split"],
                    "human": int(row["human_grade_0_3"]),
                }
            )
    labels = pd.DataFrame(rows)
    grades = {}
    for line in judgments.read_text().splitlines():
        if not line.strip():
            continue
        entry = json.loads(line)
        if entry.get("promptVersion") == PROMPT_VERSION and entry.get("grade") is not None:
            grades[(entry["infoNeedId"], entry["jobId"])] = int(entry["grade"])
    labels["judge"] = [grades.get((n, j)) for n, j in zip(labels["info_need"], labels["job"])]
    missing = labels["judge"].isna().sum()
    if missing:
        raise SystemExit(f"{missing} labeled pairs have no judge grade in {judgments}")
    labels["judge"] = labels["judge"].astype(int)
    return labels


def qrels_for(labels: pd.DataFrame, queries: pd.DataFrame, column: str) -> list:
    """TREC qrels per query: both formulations of a need share its labels."""
    by_need = {n: g for n, g in labels.groupby("info_need")}
    qrels = []
    for query_id, need in queries["infoNeedId"].items():
        for _, row in by_need.get(need, pd.DataFrame()).iterrows():
            qrels.append(ir_measures.Qrel(query_id, row["job"], int(row[column])))
    return qrels


def read_run(path: Path) -> dict[str, list[str]]:
    ranked: dict[str, list[tuple[int, str]]] = {}
    for line in path.read_text().splitlines():
        query_id, _, job, rank, *_ = line.split()
        ranked.setdefault(query_id, []).append((int(rank), job))
    return {q: [j for _, j in sorted(v)] for q, v in ranked.items()}


def condensed_scores(run_dir: Path, queries: pd.DataFrame, labels: pd.DataFrame) -> pd.DataFrame:
    """Condensed nDCG@10 per (system, labels, query) and the labeled jobs in its top 10."""
    labeled = {(n, j) for n, j in zip(labels["info_need"], labels["job"])}
    qrels = {column: qrels_for(labels, queries, column) for column in ("human", "judge")}
    frames = []
    for run_file in sorted(run_dir.glob("*.trec")):
        run = list(ir_measures.read_trec_run(str(run_file)))
        lists = read_run(run_file)
        for column, q in qrels.items():
            values = {m.query_id: m.value for m in ir_measures.iter_calc([CONDENSED], q, run)}
            for query_id, row in queries.iterrows():
                top = lists.get(query_id, [])[:DEPTH]
                covered = sum((row["infoNeedId"], j) in labeled for j in top)
                frames.append(
                    {
                        "system": run_file.stem,
                        "labels": column,
                        "query_id": query_id,
                        "info_need": row["infoNeedId"],
                        "category": row["category"],
                        # No labeled job in the list: nothing to score.
                        "value": values.get(query_id, np.nan) if covered else np.nan,
                        "labeled_in_top10": covered,
                    }
                )
    return pd.DataFrame(frames)


def randomization_test(diff: np.ndarray, rng: np.random.Generator) -> float:
    observed = abs(diff.mean())
    signs = rng.choice([-1.0, 1.0], size=(PERMUTATIONS, diff.size))
    return float((np.sum(np.abs((signs * diff).mean(axis=1)) >= observed) + 1) / (PERMUTATIONS + 1))


def bootstrap_ci(diff: np.ndarray, rng: np.random.Generator) -> tuple[float, float]:
    samples = rng.choice(diff, size=(BOOTSTRAP, diff.size), replace=True).mean(axis=1)
    low, high = np.percentile(samples, [2.5, 97.5])
    return float(low), float(high)


def by_need(scores: pd.DataFrame) -> pd.DataFrame:
    return scores.groupby(["system", "labels", "info_need"], as_index=False)[["value", "labeled_in_top10"]].mean()


def compare(needs: pd.DataFrame, rng: np.random.Generator) -> list[dict]:
    rows = []
    for labels in ("human", "judge"):
        part = needs[needs["labels"] == labels].pivot(index="info_need", columns="system", values="value")
        for system, reference in COMPARISONS:
            if system not in part or reference not in part:
                continue
            pair = part[[system, reference]].dropna()
            diff = (pair[system] - pair[reference]).to_numpy()
            low, high = bootstrap_ci(diff, rng)
            rows.append(
                {
                    "labels": labels,
                    "system": system,
                    "reference": reference,
                    "needs": len(diff),
                    "system_mean": float(pair[system].mean()),
                    "reference_mean": float(pair[reference].mean()),
                    "diff": float(diff.mean()),
                    "ci_low": low,
                    "ci_high": high,
                    "p": randomization_test(diff, rng),
                }
            )
    return rows


def disagreement(run_dir: Path, queries: pd.DataFrame, labels: pd.DataFrame) -> pd.DataFrame:
    """Judge-human agreement on the labeled jobs the rerank step moves up, down or not at all."""
    before, after = (read_run(run_dir / f"{s}.trec") for s in RERANK_STEP)
    grades = {(n, j): (h, g) for n, j, h, g in zip(labels["info_need"], labels["job"], labels["human"], labels["judge"])}
    rows = []
    for query_id, row in queries.iterrows():
        top_before = before.get(query_id, [])[:DEPTH]
        top_after = after.get(query_id, [])[:DEPTH]
        for job in set(top_before) | set(top_after):
            if (row["infoNeedId"], job) not in grades:
                continue
            rank_before = top_before.index(job) if job in top_before else DEPTH
            rank_after = top_after.index(job) if job in top_after else DEPTH
            move = "promoted" if rank_after < rank_before else "demoted" if rank_after > rank_before else "same"
            human, judge = grades[(row["infoNeedId"], job)]
            rows.append({"query_id": query_id, "info_need": row["infoNeedId"], "job": job, "move": move,
                         "human": human, "judge": judge})
    return pd.DataFrame(rows)


def agreement_by_move(moves: pd.DataFrame) -> pd.DataFrame:
    out = []
    for move, group in [("all", moves), *moves.groupby("move")]:
        h, j = group["human"] >= 2, group["judge"] >= 2
        out.append(
            {
                "move": move,
                "pairs": len(group),
                "needs": group["info_need"].nunique(),
                "human_relevant": float(h.mean()),
                "judge_relevant": float(j.mean()),
                "binary_agreement": float((h == j).mean()),
                # The judge calls relevant what the human does not, and the reverse.
                "judge_only": float((j & ~h).mean()),
                "human_only": float((h & ~j).mean()),
                "mean_grade_gap": float((group["judge"] - group["human"]).mean()),
            }
        )
    return pd.DataFrame(out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--kappa-run", type=Path, default=KAPPA_RUN)
    parser.add_argument("--judgments", type=Path, default=JUDGMENTS)
    args = parser.parse_args()

    queries = load_queries(args.run_dir)
    all_labels = load_labels(args.kappa_run, args.judgments)
    out_dir = args.run_dir / "human-check"
    out_dir.mkdir(exist_ok=True)
    report: dict = {"judgments": str(args.judgments), "kappa_run": str(args.kappa_run)}
    summaries, comparisons, disagreements = [], [], []
    for sample, labels in [("validation", all_labels[all_labels["split"] == "validation"]), ("all", all_labels)]:
        rng = np.random.default_rng(SEED)
        scores = condensed_scores(args.run_dir, queries, labels)
        needs = by_need(scores)
        summary = (
            needs.groupby(["system", "labels"])
            .agg(condensed_ndcg10=("value", "mean"), needs=("value", "count"), labeled_in_top10=("labeled_in_top10", "mean"))
            .reset_index()
            .assign(sample=sample)
        )
        summaries.append(summary)
        comparisons += [{"sample": sample, **row} for row in compare(needs, rng)]
        moves = disagreement(args.run_dir, queries, labels)
        disagreements.append(agreement_by_move(moves).assign(sample=sample))
        report[sample] = {"pairs": len(labels), "needs": int(labels["info_need"].nunique())}

    summary = pd.concat(summaries)
    summary.to_csv(out_dir / "summary.csv", index=False)
    comparison = pd.DataFrame(comparisons)
    comparison.to_csv(out_dir / "comparisons.csv", index=False)
    agreement = pd.concat(disagreements)
    agreement.to_csv(out_dir / "disagreement.csv", index=False)
    (out_dir / "report.json").write_text(json.dumps(report, indent=2) + "\n")

    pd.set_option("display.width", 200)
    print(comparison.round(3).to_string(index=False))
    print()
    print(agreement.round(3).to_string(index=False))
    print(f"\nWritten to {out_dir}")


if __name__ == "__main__":
    main()
