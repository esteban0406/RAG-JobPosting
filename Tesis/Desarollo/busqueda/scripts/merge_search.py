"""E4: merge Scholar/ACM (extracted CSV), arXiv and Semantic Scholar results; deduplicate.

Usage: python3 -I merge_search.py <scholar+acm csv> <api dir> <out csv>
One row per unique record, with every (base, string, rank) where it appeared.
"""
import csv
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

ATOM = {"a": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}


def norm(title: str) -> str:
    t = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"\.\.\.|…", "", t)
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def arxiv_rows(api: Path):
    for f in sorted(api.glob("arxiv-C*.xml")):
        sid = f.stem.split("-")[1]
        root = ET.fromstring(f.read_bytes())
        for rank, e in enumerate(root.findall("a:entry", ATOM), start=1):
            aid = e.findtext("a:id", "", ATOM).rsplit("/abs/", 1)[-1]
            doi = e.findtext("arxiv:doi", "", ATOM)
            jref = e.findtext("arxiv:journal_ref", "", ATOM)
            yield {"base": "arxiv", "string": sid, "rank": rank,
                   "title": re.sub(r"\s+", " ", e.findtext("a:title", "", ATOM)).strip(),
                   "year": e.findtext("a:published", "", ATOM)[:4], "venue": jref or "arXiv",
                   "authors": ", ".join(a.findtext("a:name", "", ATOM) for a in e.findall("a:author", ATOM)),
                   "link": f"https://arxiv.org/abs/{re.sub(r'v\d+$', '', aid)}", "doi": doi,
                   "arxiv": re.sub(r"v\d+$", "", aid),
                   "snippet": re.sub(r"\s+", " ", e.findtext("a:summary", "", ATOM)).strip()}


def s2_rows(api: Path):
    for f in sorted(api.glob("s2-C*.json")):
        sid = f.stem.split("-")[1]
        for rank, p in enumerate(json.loads(f.read_text())["data"], start=1):
            ids = p.get("externalIds") or {}
            yield {"base": "s2", "string": sid, "rank": rank, "title": p.get("title") or "",
                   "year": str(p.get("year") or ""), "venue": p.get("venue") or "", "authors": "",
                   "link": f"https://www.semanticscholar.org/paper/{p['paperId']}", "doi": ids.get("DOI", ""),
                   "arxiv": ids.get("ArXiv", ""), "snippet": p.get("abstract") or ""}


def main() -> None:
    first, api, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    rows = []
    for r in csv.DictReader(first.open(encoding="utf-8")):
        doi = re.search(r"doi\.org/(10\.\S+)|/doi/(?:abs/|full/|pdf/)?(10\.[^?#\s]+)", r["link"])
        aid = re.search(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})", r["link"])
        rows.append({**r, "doi": (doi.group(1) or doi.group(2)) if doi else "", "arxiv": aid.group(1) if aid else ""})
    rows += list(arxiv_rows(api)) + list(s2_rows(api))

    records: list[dict] = []
    index: dict[str, int] = {}
    for r in rows:
        keys = [k for k in (f"doi:{r['doi'].lower()}" if r["doi"] else "", f"arxiv:{r['arxiv']}" if r["arxiv"] else "",
                            f"title:{norm(r['title'])}" if len(norm(r["title"])) > 15 else "") if k]
        hit = next((index[k] for k in keys if k in index), None)
        if hit is None:
            hit = len(records)
            records.append({**r, "found": []})
        rec = records[hit]
        rec["found"].append(f"{r['base']}:{r['string']}:{r['rank']}")
        for field in ("doi", "arxiv", "venue", "year", "snippet", "authors"):
            if not rec.get(field) and r.get(field):
                rec[field] = r[field]
        # Prefer the longest snippet (arXiv/S2 abstracts over Scholar fragments).
        if len(r.get("snippet", "")) > len(rec.get("snippet", "")):
            rec["snippet"] = r["snippet"]
        for k in keys:
            index.setdefault(k, hit)
    fields = ["id", "title", "year", "venue", "authors", "doi", "arxiv", "link", "found", "snippet"]
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for i, rec in enumerate(records, start=1):
            w.writerow({**rec, "id": f"R{i:04d}", "found": " ".join(rec["found"])})
    print(f"{len(rows)} results -> {len(records)} unique records")


if __name__ == "__main__":
    main()
