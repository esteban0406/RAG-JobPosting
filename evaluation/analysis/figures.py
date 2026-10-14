"""Thesis figures from a metrics.py analysis directory.

Usage:
    python evaluation/analysis/figures.py <analysis dir> <output dir>

Writes ndcg-by-category.pdf: nDCG@10 per query category for ILIKE, BM25 and
dense retrieval served by Qdrant (the three dense systems differ by less than
0.01, so one stands for all).
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
import numpy as np
import pandas as pd

CATEGORIES = {
    "exact": "Exactas",
    "semantic_vocab_mismatch": "Desajuste de\nvocabulario",
    "constraint": "Con\nrestricciones",
    "noisy": "Ruidosas",
}
# Fixed categorical order (validated: CVD all-pairs dE >= 9.2 on light).
SYSTEMS = {
    "qdrant-hnsw": ("Denso (Qdrant HNSW)", "#2a78d6"),
    "bm25": ("BM25", "#eb6834"),
    "ilike": ("ILIKE", "#1baf7a"),
}
INK = "#0b0b0b"
MUTED = "#52514e"
GRID = "#e4e3df"


def ndcg_by_category(analysis_dir: Path, out_dir: Path) -> Path:
    summary = pd.read_csv(analysis_dir / "summary.csv")
    fig, ax = plt.subplots(figsize=(6.2, 3.4))
    x = np.arange(len(CATEGORIES))
    width = 0.26
    for i, (system, (label, color)) in enumerate(SYSTEMS.items()):
        values = [
            summary.loc[(summary["group"] == f"category={c}") & (summary["system"] == system), "nDCG@10"].item()
            for c in CATEGORIES
        ]
        ax.bar(x + (i - 1) * width, values, width - 0.03, color=color, label=label, zorder=2)
    ax.set_xticks(x, CATEGORIES.values(), color=INK, fontsize=9)
    ax.set_ylabel("nDCG@10", color=MUTED, fontsize=9)
    ax.set_ylim(0, 1)
    # Spanish decimal comma, as in the rest of the thesis.
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:.1f}".replace(".", ",")))
    ax.tick_params(axis="y", colors=MUTED, labelsize=8)
    ax.tick_params(axis="x", length=0)
    ax.grid(axis="y", color=GRID, linewidth=0.8, zorder=0)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(MUTED)
    ax.legend(frameon=False, fontsize=8, ncol=3, loc="upper center", bbox_to_anchor=(0.5, 1.12), labelcolor=INK)
    fig.tight_layout()
    path = out_dir / "ndcg-by-category.pdf"
    fig.savefig(path)
    plt.close(fig)
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("analysis_dir", type=Path)
    parser.add_argument("out_dir", type=Path)
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    print(ndcg_by_category(args.analysis_dir, args.out_dir))


if __name__ == "__main__":
    main()
