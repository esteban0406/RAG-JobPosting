"""Compact digest of extracted paper texts for E4 data extraction.

Usage: python3 -I digest.py <textos dir> <id> [<id> ...]
Prints the abstract and the sentences that mention evaluation details.
"""
import re
import sys
from pathlib import Path

KEYS = re.compile(r"\b(BM25|baseline|nDCG|NDCG|MRR|MAP@?\d*|Recall@|R@\d|P@\d|precision@|Hit@|HR@|accuracy|F1|dataset|corpus|postings|vacanc|resumes|CVs|annotat|human evaluation|judge|ablation|latency|ms\b|A/B)", re.I)


def clean(text: str) -> str:
    text = re.sub(r"-\n(\w)", r"\1", text)
    return re.sub(r"\s+", " ", text)


def main() -> None:
    root = Path(sys.argv[1])
    for pid in sys.argv[2:]:
        raw = (root / f"{pid}.txt").read_text(errors="replace")
        text = clean(raw)
        m = re.search(r"\babstract\b[\s.:—-]*(.{200,1400}?)(?:\b(?:Keywords|Index Terms|CCS Concepts|1\.? Introduction|I\. INTRODUCTION|Introduction)\b)", text, re.I)
        abstract = (m.group(1) if m else text[:900]).strip()
        body = text[m.end():] if m else text
        sentences = re.split(r"(?<=[.!?])\s+", body)
        hits, seen = [], 0
        for s in sentences:
            if KEYS.search(s) and re.search(r"\d", s) and 40 < len(s) < 400:
                hits.append(s.strip())
                seen += len(s)
                if seen > 1300:
                    break
        print(f"=== {pid}\nABS: {abstract[:1100]}\nEVAL: " + " || ".join(hits) + "\n")


if __name__ == "__main__":
    main()
