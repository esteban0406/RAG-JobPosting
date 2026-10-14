"""Applies the reranker decision rule fixed before any result (Tesis/Desarollo/steps.md,
step 5b) to the development-set runs.

Usage:
    python evaluation/analysis/rerank_selection.py stage1 <run dir> --qrels-name <name>
    python evaluation/analysis/rerank_selection.py stage2 <run dir> --qrels-name <name> --winner <system>
    python evaluation/analysis/rerank_selection.py stage3 <dev run dir> <ood run dir> --system <system>

<run dir>/analysis-<qrels name>/summary.csv comes from metrics.py; rerank-top.jsonl from
eval:retrieve.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

REFERENCE = "qdrant-hybrid"
# Simplest first: no new model, then no fusion, then no instruction.
SIMPLICITY = ["rr-bge", "rr-bge-rrf", "rr-qwen", "rr-qwen-instr", "rr-qwen-instr-rrf"]
MARGIN = 0.02
CANDIDATES_MARGIN = 0.01


def summary(run_dir: Path, qrels_name: str) -> pd.DataFrame:
    return pd.read_csv(run_dir / f"analysis-{qrels_name}" / "summary.csv")


def stage1(run_dir: Path, qrels_name: str) -> None:
    s = summary(run_dir, qrels_name)
    overall = s[s["group"] == "all"].set_index("system")
    by_cat = (
        s[s["group"].str.startswith("category=")]
        .pivot_table(index="system", columns="group", values="nDCG@10")
        .rename(columns=lambda c: c.removeprefix("category="))
    )
    table = overall[["nDCG@10", "P@5", "MRR"]].join(by_cat).sort_values("nDCG@10", ascending=False)
    print(table.round(3).to_string())

    candidates = overall.loc[[v for v in SIMPLICITY if v in overall.index], "nDCG@10"]
    best = candidates.max()
    within = [v for v in SIMPLICITY if v in candidates.index and best - candidates[v] <= MARGIN]
    winner = within[0]
    print(f"\nbest nDCG@10 = {best:.3f} ({candidates.idxmax()}); within {MARGIN}: {within}")
    print(f"reference without reranking ({REFERENCE}): {overall.loc[REFERENCE, 'nDCG@10']:.3f}")
    print(f"WINNER (stage 1): {winner}")


def stage2(run_dir: Path, qrels_name: str, winner: str) -> None:
    overall = summary(run_dir, qrels_name).query("group == 'all'").set_index("system")
    n30 = overall.loc[winner, "nDCG@10"]
    n20 = overall.loc[f"{winner}-20", "nDCG@10"]
    choice = 20 if n30 - n20 <= CANDIDATES_MARGIN else 30
    print(f"{winner}: nDCG@10 with 30 candidates {n30:.3f}, with 20 {n20:.3f} -> use {choice}")


def top_scores(run_dir: Path, system: str) -> pd.Series:
    rows = [json.loads(line) for line in (run_dir / "rerank-top.jsonl").read_text().splitlines() if line]
    return pd.DataFrame(rows).query("system == @system").set_index("queryId")["top"]


def stage3(dev_dir: Path, ood_dir: Path, system: str) -> None:
    dev = top_scores(dev_dir, system).sort_values()
    ood = top_scores(ood_dir, system).sort_values()
    print("dev top-1 rerank scores (lowest 5):", dev.head(5).round(3).to_dict())
    print("ood top-1 rerank scores:", ood.round(3).to_dict())
    # Largest t such that at most one in-domain query falls below it.
    t = dev.iloc[1]
    below = int((ood < t).sum())
    adopted = below >= 8
    print(f"t = {t:.3f}: {int((dev < t).sum())}/{len(dev)} dev queries below, {below}/{len(ood)} out-of-domain below")
    print(f"THRESHOLD: {'adopt RERANK_MIN_SCORE=' + format(t, '.3f') if adopted else 'none (does not separate)'}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="stage", required=True)
    p1 = sub.add_parser("stage1")
    p1.add_argument("run", type=Path)
    p1.add_argument("--qrels-name", required=True)
    p2 = sub.add_parser("stage2")
    p2.add_argument("run", type=Path)
    p2.add_argument("--qrels-name", required=True)
    p2.add_argument("--winner", required=True)
    p3 = sub.add_parser("stage3")
    p3.add_argument("dev", type=Path)
    p3.add_argument("ood", type=Path)
    p3.add_argument("--system", required=True)
    args = parser.parse_args()
    if args.stage == "stage1":
        stage1(args.run, args.qrels_name)
    elif args.stage == "stage2":
        stage2(args.run, args.qrels_name, args.winner)
    else:
        stage3(args.dev, args.ood, args.system)


if __name__ == "__main__":
    main()
