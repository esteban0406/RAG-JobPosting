"""Thesis figures from a metrics.py analysis directory and the store benchmark.

Usage:
    python evaluation/analysis/figures.py <analysis dir> <output dir> [--bench <summary.csv>]

Writes ndcg-by-category.pdf: nDCG@10 per query category (means over
information needs) for BM25, dense retrieval and the full configuration (ILIKE
scores near zero and is left to the tables). With --bench, also writes
recall-latency.pdf: recall@10 against median latency for pgvector and Qdrant in
three scenarios of the store benchmark (evaluation/bench/results/summary.csv).
Also writes ladder.pdf: nDCG@10 and constraint compliance (C@5) along the
component ladder, with BM25 and BM25 with filters for reference. With
--latency, writes latency-iterations.pdf: median classification, context and
time to first token per iteration, from the two generation latency runs.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter, LogLocator, MultipleLocator
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
    "bm25": ("BM25", "#eb6834"),
    "qdrant-hnsw": ("Denso multilingüe", "#2a78d6"),
    "qdrant-hybrid-rerank": ("Configuración completa", "#1baf7a"),
}
# Store benchmark: one hue per engine; pgvector's iterative scan is the same
# engine, so it keeps the hue and changes the line style.
ENGINES = {
    ("pgvector", "off"): ("pgvector", "#eb6834", "-"),
    ("pgvector", "relaxed_order"): ("pgvector, barrido iterativo", "#eb6834", "--"),
    ("qdrant", "n/a"): ("Qdrant", "#2a78d6", "-"),
}
SCENARIOS = [
    ("real", "none", "Corpus real (4.013), sin filtro"),
    ("synth-500000", "none", "500.000 vectores, sin filtro"),
    ("synth-500000", "1pct", "500.000 vectores, filtro del 1 %"),
]
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


def comma(value: float, decimals: int) -> str:
    return f"{value:.{decimals}f}".replace(".", ",")


def recall_latency(bench_summary: Path, out_dir: Path) -> Path:
    # keep_default_na=False: Qdrant rows say "n/a" in the iterative column.
    bench = pd.read_csv(bench_summary, keep_default_na=False)
    fig, axes = plt.subplots(1, len(SCENARIOS), figsize=(7.4, 2.9), sharey=True)
    for ax, (dataset, filt, title) in zip(axes, SCENARIOS):
        part = bench[(bench["dataset"] == dataset) & (bench["filter"] == filt)]
        for (engine, iterative), (label, color, style) in ENGINES.items():
            line = part[(part["engine"] == engine) & (part["iterative"] == iterative)].sort_values("ef")
            if line.empty or (filt == "none" and iterative == "relaxed_order"):
                continue
            ax.plot(line["p50_ms"], line["recall"], style, color=color, linewidth=2, marker="o",
                    markersize=4, markeredgecolor="white", markeredgewidth=1, label=label, zorder=3)
        ax.set_xscale("log")
        ax.set_title(title, color=INK, fontsize=8.5)
        ax.set_xlabel("Latencia p50 (ms)", color=MUTED, fontsize=8)
        ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: comma(v, 1 if v < 1 else 0)))
        # Labelled intermediate ticks (2 and 5 of each decade) so values can be read off
        # the log axis (review B6).
        ax.xaxis.set_minor_locator(LogLocator(base=10, subs=(2.0, 5.0)))
        ax.xaxis.set_minor_formatter(FuncFormatter(lambda v, _: comma(v, 1 if v < 1 else 0)))
        ax.tick_params(axis="x", which="minor", labelsize=6.5, colors=MUTED)
        ax.tick_params(colors=MUTED, labelsize=7.5)
        ax.grid(color=GRID, linewidth=0.8, zorder=0)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        for side in ("left", "bottom"):
            ax.spines[side].set_color(MUTED)
    axes[0].set_ylabel("Recall@10", color=MUTED, fontsize=8)
    axes[0].set_ylim(0, 1.02)
    axes[0].yaxis.set_major_formatter(FuncFormatter(lambda v, _: comma(v, 1)))
    handles, labels = axes[-1].get_legend_handles_labels()
    fig.legend(handles, labels, frameon=False, fontsize=8, ncol=3, loc="upper center",
               bbox_to_anchor=(0.5, 1.02), labelcolor=INK)
    fig.tight_layout(rect=(0, 0, 1, 0.92))
    path = out_dir / "recall-latency.pdf"
    fig.savefig(path)
    plt.close(fig)
    return path


# Component ladder, in reading order; lexical baselines first, then the ladder steps.
LADDER = [
    ("bm25", "BM25"),
    ("bm25-filtered", "BM25\n+ filtros"),
    ("qdrant-hnsw", "Densa"),
    ("qdrant-filtered", "+ filtros"),
    ("qdrant-hybrid", "+ híbrida"),
    ("qdrant-hybrid-rerank", "+ reorde-\nnamiento"),
]
LEXICAL = "#eb6834"
DENSE = "#2a78d6"


def ladder(analysis_dir: Path, out_dir: Path) -> Path:
    summary = pd.read_csv(analysis_dir / "summary.csv").set_index(["group", "system"])
    fig, axes = plt.subplots(1, 2, figsize=(7.4, 2.9), sharey=True)
    x = np.arange(len(LADDER))
    colors = [LEXICAL if system.startswith("bm25") else DENSE for system, _ in LADDER]
    for ax, (measure, title) in zip(axes, [("nDCG@10", "nDCG@10"), ("C@5", "Cumplimiento de restricciones (C@5)")]):
        values = [summary.at[("all", system), measure] for system, _ in LADDER]
        ax.bar(x, values, 0.62, color=colors, zorder=2)
        for xi, v in zip(x, values):
            ax.text(xi, v + 0.02, comma(v, 3), ha="center", va="bottom", fontsize=7, color=INK)
        ax.axvline(1.5, color=GRID, linewidth=1.2, zorder=1)
        ax.set_title(title, color=INK, fontsize=8.5)
        ax.set_xticks(x, [label for _, label in LADDER], color=INK, fontsize=7.5)
        ax.set_ylim(0, 1.08)
        ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: comma(v, 1)))
        ax.tick_params(axis="y", colors=MUTED, labelsize=7.5)
        ax.tick_params(axis="x", length=0)
        ax.grid(axis="y", color=GRID, linewidth=0.8, zorder=0)
        for side in ("top", "right", "left"):
            ax.spines[side].set_visible(False)
        ax.spines["bottom"].set_color(MUTED)
    fig.tight_layout()
    path = out_dir / "ladder.pdf"
    fig.savefig(path)
    plt.close(fig)
    return path


def latency_iterations(runs: list[Path], out_dir: Path) -> Path:
    stages = [("classifyMs", "Clasificación", "#9b8ec4"), ("contextMs", "Contexto", DENSE), ("ttftMs", "Primer token (TTFT)", "#1baf7a")]
    medians = []
    for run in runs:
        rows = [json.loads(line) for line in (run / "latency.jsonl").read_text().splitlines() if line.strip()]
        data = pd.DataFrame(rows)
        data = data[data["kind"] == "generation"]
        medians.append({col: (data[col].median() / 1000 if col in data else None) for col, _, _ in stages})
    labels = ["Iteración 1", "Iteración 2"]
    fig, ax = plt.subplots(figsize=(6.4, 1.9))
    for row, (label, med) in enumerate(zip(labels, medians)):
        y = len(labels) - 1 - row
        left = 0.0
        unmeasured = False
        for col, name, color in stages:
            value = med[col]
            if value is None:
                unmeasured = True
                continue
            ax.barh(y, value, 0.5, left=left, color=color, label=name if row == 1 else None, zorder=2)
            if value >= 0.15:
                ax.text(left + value / 2, y, comma(value, 2), ha="center", va="center", fontsize=7, color="white")
            left += value
        if unmeasured:
            ax.text(left + 0.04, y, "(clasificación no medida)", va="center", fontsize=7, color=MUTED, style="italic")
    ax.set_yticks(range(len(labels)), labels[::-1], color=INK, fontsize=8)
    ax.set_xlabel("Segundos (medianas por etapa)", color=MUTED, fontsize=8)
    ax.xaxis.set_major_locator(MultipleLocator(0.5))
    ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: comma(v, 1)))
    ax.tick_params(axis="x", colors=MUTED, labelsize=7.5)
    ax.tick_params(axis="y", length=0)
    ax.grid(axis="x", color=GRID, linewidth=0.8, zorder=0)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(MUTED)
    ax.legend(frameon=False, fontsize=7.5, ncol=3, loc="upper center", bbox_to_anchor=(0.5, 1.3), labelcolor=INK)
    fig.tight_layout()
    path = out_dir / "latency-iterations.pdf"
    fig.savefig(path)
    plt.close(fig)
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("analysis_dir", type=Path)
    parser.add_argument("out_dir", type=Path)
    parser.add_argument("--bench", type=Path, help="store benchmark summary.csv")
    parser.add_argument("--latency", type=Path, nargs=2, metavar=("ITER1_RUN", "ITER2_RUN"),
                        help="generation latency runs of Iteration 1 and Iteration 2")
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    print(ndcg_by_category(args.analysis_dir, args.out_dir))
    print(ladder(args.analysis_dir, args.out_dir))
    if args.latency:
        print(latency_iterations(list(args.latency), args.out_dir))
    if args.bench:
        print(recall_latency(args.bench, args.out_dir))


if __name__ == "__main__":
    main()
