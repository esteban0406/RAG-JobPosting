"""How many latency queries call the LLM classifier, per iteration (offline).

Usage (from the repository root, plain Python 3, no model calls):
    python3 evaluation/analysis/classifier_calls.py

For each generation-latency run of PE3 it takes the commit that ran it
(config.json, gitSha) and the 30 queries it measured (generationSubset), reads
the routing regexes of backend/src/query/query-classifier.service.ts and the
query texts of the dataset *at that commit* (git show), and applies the
classifier's routing rule offline:

- Iteration 1 (no CONSTRAINT_PATTERN): a query skips the LLM only when it
  matches RETRIEVAL_PATTERN and not AGGREGATION_PATTERN.
- Iteration 2: the same, and it must not match CONSTRAINT_PATTERN either.

Checks the claim of the PE3 section that classification is not a new cost of
Iteration 2 (task 4 of the second-draft corrections, 17-nov-2026).
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

RUNS = Path("evaluation/runs")
LATENCY_GENERATION = {
    "1": RUNS / "2026-10-14T01-06-11-717ba41-dirty-latency-qdrant-generation",
    "2": RUNS / "2026-11-01T17-44-24-a951cf6-latency-qdrant-test-full-generation",
}
CLASSIFIER = "backend/src/query/query-classifier.service.ts"


def git_show(commit: str, path: str) -> str:
    return subprocess.run(["git", "show", f"{commit}:{path}"], check=True,
                          capture_output=True, text=True).stdout


def patterns(source: str) -> dict[str, re.Pattern]:
    """The *_PATTERN regex literals of the classifier (JS syntax used is Python-compatible)."""
    found = re.findall(r"const (\w+_PATTERN) =\s*/(.+?)/([a-z]*);", source, re.S)
    return {name: re.compile(body, re.I if "i" in flags else 0) for name, body, flags in found}


def calls_llm(text: str, p: dict[str, re.Pattern]) -> bool:
    retrieval_only = bool(p["RETRIEVAL_PATTERN"].search(text)) and not p["AGGREGATION_PATTERN"].search(text)
    if "CONSTRAINT_PATTERN" in p:
        retrieval_only = retrieval_only and not p["CONSTRAINT_PATTERN"].search(text)
    return not retrieval_only


def main() -> None:
    for iteration, run in LATENCY_GENERATION.items():
        config = json.loads((run / "config.json").read_text())
        commit = config["gitSha"].removesuffix("-dirty")
        dataset = config["dataset"].removeprefix("../")
        texts = {q["id"]: q["text"] for q in (json.loads(line) for line in
                 git_show(commit, dataset).splitlines() if line.lstrip().startswith("{"))}
        p = patterns(git_show(commit, CLASSIFIER))
        subset = config["generationSubset"]
        llm = [qid for qid in subset if calls_llm(texts[qid], p)]
        skipped = [qid for qid in subset if qid not in llm]
        print(f"Iteration {iteration} ({commit}, patterns: {', '.join(sorted(p))}): "
              f"{len(llm)} of {len(subset)} queries call the LLM classifier; "
              f"without LLM: {', '.join(skipped) or '-'}")


if __name__ == "__main__":
    main()
