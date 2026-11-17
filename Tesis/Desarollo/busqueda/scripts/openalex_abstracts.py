"""Metadata and abstracts from OpenAlex for E4 records without full text.

Usage: python3 -I openalex_abstracts.py <registros-unicos.csv> <out.jsonl> <id> [<id> ...]
Looks each record up by DOI (or arXiv id, or title search as a last resort) and
writes one JSON line per id: matched title, year, venue, DOI, OA status and the
abstract rebuilt from OpenAlex's inverted index. A title match is flagged so it
can be checked by hand.
"""
import csv
import json
import sys
import time
import urllib.parse
import urllib.request

API = "https://api.openalex.org/works"
UA = {"User-Agent": "thesis-literature-search/1.0"}


def get(url: str):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def abstract(work: dict) -> str:
    inv = work.get("abstract_inverted_index") or {}
    words = sorted((p, w) for w, ps in inv.items() for p in ps)
    return " ".join(w for _, w in words)


def lookup(rec: dict):
    if rec["doi"]:
        return get(f"{API}/doi:{rec['doi']}"), "doi"
    if rec["arxiv"]:
        return get(f"{API}/doi:10.48550/arXiv.{rec['arxiv']}"), "arxiv"
    q = urllib.parse.quote(rec["title"])
    res = get(f"{API}?search={q}&per-page=1")["results"]
    return (res[0] if res else None), "title"


def main() -> None:
    recs = {r["id"]: r for r in csv.DictReader(open(sys.argv[1]))}
    with open(sys.argv[2], "a") as out:
        for pid in sys.argv[3:]:
            rec = recs[pid]
            try:
                w, how = lookup(rec)
            except Exception as e:  # noqa: BLE001 — record the failure and go on
                w, how = None, f"error: {e}"
            row = {"id": pid, "query_title": rec["title"], "match": how}
            if w:
                loc = w.get("primary_location") or {}
                row |= {
                    "title": w.get("title"),
                    "year": w.get("publication_year"),
                    "venue": (loc.get("source") or {}).get("display_name"),
                    "doi": w.get("doi"),
                    "oa": (w.get("open_access") or {}).get("oa_url"),
                    "abstract": abstract(w),
                }
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
            print(pid, how, (row.get("title") or "")[:70], len(row.get("abstract", "")))
            time.sleep(0.2)


if __name__ == "__main__":
    main()
