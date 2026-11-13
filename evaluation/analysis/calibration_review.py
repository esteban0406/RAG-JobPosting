"""Blind second pass over the calibration labels before the validation split.

Usage:
    python3 evaluation/analysis/calibration_review.py make <run dir> \
        --judgments <judge.jsonl> [<judge.jsonl> ...] [--fillers 20] [--seed 42]
    python3 evaluation/analysis/annotate.py <run dir>/calibration-review.csv
    python3 evaluation/analysis/calibration_review.py merge <run dir>

make selects the calibration pairs where the human label and at least one judge
disagree on binary relevance (grade >= 2), adds --fillers pairs where they all
agree, shuffles them and writes calibration-review.csv with the grades blank, so
the annotator cannot tell disputed pairs from fillers and sees neither the old
grade nor the judges'. Which pair is which goes to calibration-review-key.json.
A --fillers larger than the agreed pairs reviews the whole calibration split.
merge copies the new grades into kappa-sample.csv (the old ones stay in git),
writes calibration-review-report.json and prints how many grades changed, split
into disputed pairs and fillers (the fillers measure the annotator's own
consistency). Only calibration rows are read or written: the validation split
is never compared with a judge. Standard library only.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from annotate import GRADE, read_sheet, write_sheet

# Must match PROMPT_VERSION in backend/src/eval/relevance/umbrela.ts.
PROMPT_VERSION = "umbrela-jobs-v2"
SHEET = "kappa-sample.csv"
REVIEW = "calibration-review.csv"
REVIEW_KEY = "calibration-review-key.json"


def load_key(run_dir: Path) -> dict[str, dict]:
    lines = (run_dir / "kappa-key.jsonl").read_text().splitlines()
    return {str(row["sampleId"]): row for row in (json.loads(l) for l in lines if l.strip())}


def load_grades(path: Path) -> dict[tuple[str, str], int]:
    grades = {}
    for line in path.read_text().splitlines():
        if line.strip():
            j = json.loads(line)
            if j["promptVersion"] == PROMPT_VERSION and j["grade"] >= 0:
                grades[(j["infoNeedId"], j["jobId"])] = j["grade"]
    return grades


def make(args: argparse.Namespace) -> None:
    key = load_key(args.run_dir)
    header, rows = read_sheet(args.run_dir / SHEET)
    judges = {path.stem: load_grades(path) for path in args.judgments}
    disputed, agreed = [], []
    for row in rows:
        if row["split"] != "calibration":
            continue
        if not row[GRADE].strip():
            raise SystemExit(f"Calibration row {row['sample_id']} has no grade; label it first.")
        pair = (key[row["sample_id"]]["infoNeedId"], key[row["sample_id"]]["jobId"])
        human = int(row[GRADE]) >= 2
        verdicts = [grades[pair] >= 2 for grades in judges.values() if pair in grades]
        (disputed if any(v != human for v in verdicts) else agreed).append(row)

    rng = random.Random(args.seed)
    fillers = rng.sample(agreed, min(args.fillers, len(agreed)))
    review = [dict(row, **{GRADE: "", "notes": ""}) for row in disputed + fillers]
    rng.shuffle(review)
    write_sheet(args.run_dir / REVIEW, header, review)
    (args.run_dir / REVIEW_KEY).write_text(
        json.dumps(
            {
                "judges": list(judges),
                "seed": args.seed,
                "disputed": [r["sample_id"] for r in disputed],
                "fillers": [r["sample_id"] for r in fillers],
                "old_grades": {r["sample_id"]: r[GRADE] for r in disputed + fillers},
            },
            indent=2,
        )
    )
    print(f"{len(disputed)} disputed + {len(fillers)} fillers → {args.run_dir / REVIEW}")


def merge(args: argparse.Namespace) -> None:
    review_key = json.loads((args.run_dir / REVIEW_KEY).read_text())
    _, review = read_sheet(args.run_dir / REVIEW)
    new = {r["sample_id"]: r for r in review}
    missing = [sid for sid, r in new.items() if not r[GRADE].strip()]
    if missing:
        raise SystemExit(f"{len(missing)} review rows have no grade yet; finish the review first.")

    header, rows = read_sheet(args.run_dir / SHEET)
    for row in rows:
        if row["sample_id"] in new:
            row[GRADE] = new[row["sample_id"]][GRADE]
            row["notes"] = new[row["sample_id"]]["notes"]
    write_sheet(args.run_dir / SHEET, header, rows)

    old = review_key["old_grades"]
    report = {}
    for group in ("disputed", "fillers"):
        ids = review_key[group]
        changed = [sid for sid in ids if new[sid][GRADE] != old[sid]]
        flipped = [sid for sid in ids if (int(new[sid][GRADE]) >= 2) != (int(old[sid]) >= 2)]
        report[group] = {
            "n": len(ids),
            "grade_changed": len(changed),
            "binary_changed": len(flipped),
            "changes": {sid: f"{old[sid]}->{new[sid][GRADE]}" for sid in changed},
        }
        print(f"{group}: {len(ids)} pairs, {len(changed)} grades changed, {len(flipped)} cross the >= 2 line")
    (args.run_dir / "calibration-review-report.json").write_text(json.dumps(report, indent=2))
    print(f"New grades written to {args.run_dir / SHEET}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    p_make = sub.add_parser("make")
    p_make.add_argument("run_dir", type=Path)
    p_make.add_argument("--judgments", type=Path, nargs="+", required=True)
    p_make.add_argument("--fillers", type=int, default=20)
    p_make.add_argument("--seed", type=int, default=42)
    p_merge = sub.add_parser("merge")
    p_merge.add_argument("run_dir", type=Path)
    args = parser.parse_args()
    make(args) if args.command == "make" else merge(args)


if __name__ == "__main__":
    main()
