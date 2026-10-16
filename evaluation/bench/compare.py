"""Robustness check: the same benchmark points with two embedding models.

Usage (from the repository root, in the jobai-analysis image):
    python evaluation/bench/compare.py [results dir] [reference dir]

Defaults: evaluation/bench/results (multilingual-e5-base vectors) against
evaluation/bench/results-e5-base-v2. Joins both summary.csv files by engine,
dataset, filter, iterative scan and ef, and prints recall, p50 latency and
completeness side by side (suffix _ref), plus each run's load, memory and
disk records.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

KEYS = ["engine", "dataset", "filter", "iterative", "ef"]


def main() -> None:
    results = Path(sys.argv[1] if len(sys.argv) > 1 else "evaluation/bench/results")
    reference = Path(sys.argv[2] if len(sys.argv) > 2 else "evaluation/bench/results-e5-base-v2")
    merged = pd.read_csv(results / "summary.csv").merge(
        pd.read_csv(reference / "summary.csv"), on=KEYS, how="left", suffixes=("", "_ref")
    )
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 500)
    columns = ["engine", "iterative", "ef", "recall", "recall_ref", "p50_ms", "p50_ms_ref",
               "qps_8", "completeness", "completeness_ref", "plan"]
    for (dataset, filter_), group in merged.groupby(["dataset", "filter"], sort=False):
        print(f"\n=== {dataset}, filter {filter_}")
        print(group.sort_values(["engine", "iterative", "ef"])[columns].round(3).to_string(index=False))

    print("\n=== load / memory / disk")
    for pattern in ["load-*.json", "mem-*.json", "disk-*.txt"]:
        for path in sorted(results.glob(pattern)):
            print(path.name, " ".join(path.read_text().split()))


if __name__ == "__main__":
    main()
