"""Agreement between the LLM relevance judge and the human labels (Cohen, 1960).

Usage:
    python evaluation/analysis/kappa.py <run dir> --labels <labeled kappa-sample.csv> \
        --judgments <judge.jsonl> [<judge.jsonl> ...] [--prompt-version umbrela-jobs-v2]

The labeled CSV is kappa-sample.csv (from eval:kappa-export) with the
human_grade_0_3 column filled in. For each judge, reports per split
(calibration, validation): n, exact agreement, Cohen's kappa on binary
relevance (grade >= 2), quadratic-weighted kappa on the 0-3 scale (both with
bootstrap 95% CIs) and the confusion matrix. The thesis reports the
validation split; calibration rows tune the prompt and confirm the choice of
the final judge. Only verdicts of --prompt-version count: a judgment cache holds
every prompt version it has seen, and mixing them would compare the human
labels with a prompt the sample was not drawn for.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np

LEVELS = 4
BOOTSTRAP = 2000
SEED = 42
# Must match PROMPT_VERSION in backend/src/eval/relevance/umbrela.ts.
DEFAULT_PROMPT_VERSION = "umbrela-jobs-v2"


def cohen_kappa(a: np.ndarray, b: np.ndarray, levels: int, weights: str | None = None) -> float:
    observed = np.zeros((levels, levels))
    for x, y in zip(a, b):
        observed[x, y] += 1
    observed /= observed.sum()
    expected = np.outer(observed.sum(axis=1), observed.sum(axis=0))
    i, j = np.indices((levels, levels))
    w = ((i - j) ** 2) / (levels - 1) ** 2 if weights == "quadratic" else (i != j).astype(float)
    denom = (w * expected).sum()
    return 1.0 - (w * observed).sum() / denom if denom > 0 else float("nan")


def bootstrap(fn, a: np.ndarray, b: np.ndarray, rng: np.random.Generator) -> tuple[float, float]:
    stats = []
    for _ in range(BOOTSTRAP):
        idx = rng.integers(0, len(a), len(a))
        value = fn(a[idx], b[idx])
        if not np.isnan(value):
            stats.append(value)
    low, high = np.percentile(stats, [2.5, 97.5]) if stats else (float("nan"), float("nan"))
    return float(low), float(high)


def agreement(human: np.ndarray, judge: np.ndarray, rng: np.random.Generator) -> dict:
    binary = lambda x, y: cohen_kappa((x >= 2).astype(int), (y >= 2).astype(int), 2)
    weighted = lambda x, y: cohen_kappa(x, y, LEVELS, "quadratic")
    confusion = np.zeros((LEVELS, LEVELS), dtype=int)
    for h, j in zip(human, judge):
        confusion[h, j] += 1
    return {
        "n": int(len(human)),
        "exact_agreement": float(np.mean(human == judge)),
        "kappa_binary": binary(human, judge),
        "kappa_binary_ci95": bootstrap(binary, human, judge, rng),
        "kappa_quadratic": weighted(human, judge),
        "kappa_quadratic_ci95": bootstrap(weighted, human, judge, rng),
        "confusion_rows_human_cols_judge": confusion.tolist(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--labels", type=Path, required=True)
    parser.add_argument("--judgments", type=Path, nargs="+", required=True)
    parser.add_argument("--prompt-version", default=DEFAULT_PROMPT_VERSION)
    args = parser.parse_args()

    key = {
        row["sampleId"]: row
        for row in (json.loads(l) for l in (args.run_dir / "kappa-key.jsonl").read_text().splitlines() if l.strip())
    }
    human = {}
    with open(args.labels, newline="") as fh:
        for row in csv.DictReader(fh):
            grade = row["human_grade_0_3"].strip()
            if grade in {"0", "1", "2", "3"}:
                human[int(row["sample_id"])] = int(grade)
    print(f"{len(human)} of {len(key)} sample rows labeled")

    rng = np.random.default_rng(SEED)
    for path in args.judgments:
        grades = {}
        for line in path.read_text().splitlines():
            if not line.strip():
                continue
            j = json.loads(line)
            if j["promptVersion"] == args.prompt_version and j["grade"] >= 0:
                grades[(j["infoNeedId"], j["jobId"])] = j["grade"]
        report = {"judge": path.stem, "prompt_version": args.prompt_version}
        for split in ("calibration", "validation"):
            pairs = [
                (human[sid], grades[(k["infoNeedId"], k["jobId"])])
                for sid, k in key.items()
                if k["split"] == split and sid in human and (k["infoNeedId"], k["jobId"]) in grades
            ]
            if pairs:
                h, j = map(np.array, zip(*pairs))
                report[split] = agreement(h, j, rng)
        out = args.run_dir / f"kappa-{path.stem}.json"
        out.write_text(json.dumps(report, indent=2))
        for split in ("calibration", "validation"):
            if split in report:
                r = report[split]
                print(
                    f"{path.stem} [{split}] n={r['n']} agreement={r['exact_agreement']:.2f} "
                    f"kappa_bin={r['kappa_binary']:.3f} {tuple(round(x, 3) for x in r['kappa_binary_ci95'])} "
                    f"kappa_qw={r['kappa_quadratic']:.3f} {tuple(round(x, 3) for x in r['kappa_quadratic_ci95'])}"
                )
        print(f"Written to {out}")


if __name__ == "__main__":
    main()
