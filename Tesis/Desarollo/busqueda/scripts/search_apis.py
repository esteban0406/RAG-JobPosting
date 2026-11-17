"""E4: run C1-C9 on arXiv and Semantic Scholar and save the raw responses.

Usage: python3 -I search_apis.py <out dir> [arxiv|s2]
arXiv: abstract field, categories cs.IR or cs.CL, submitted 2019-2026, first 50 by relevance.
Semantic Scholar: /paper/search/bulk (boolean syntax), years 2019-2026, 50 most cited (all for C1):
bulk search has no relevance order.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

# Each string as groups of alternatives joined by AND (the protocol's C1-C9).
STRINGS = {
    "C1": [['"retrieval-augmented generation"', '"dense retrieval"', '"semantic search"', '"neural ranking"'],
           ["job", "recruitment", "vacancy", '"job matching"', '"job search"']],
    "C2": [['"retrieval-augmented generation"', "RAG"], ["evaluation"],
           ["component", "ablation", "retriever", "reranker"]],
    "C3": [['"large language model"', "LLM"],
           ['"relevance judgments"', '"relevance assessment"', '"LLM-as-a-judge"'], ["retrieval", "TREC"]],
    "C4": [['"assessor disagreement"', '"inter-assessor agreement"', '"relevance judgments"'],
           ["variation", "reliability"], ['"test collection"', '"system ranking"']],
    "C5": [["pooling", '"incomplete judgments"', '"unjudged documents"'], ['"test collection"'], ["retrieval"]],
    "C6": [["JobBERT", "ESCO", '"skill extraction"', "occupation"], ["embedding", "representation", "retrieval"]],
    "C7": [['"query expansion"', '"document expansion"', "doc2query", "HyDE", "RM3"], ["retrieval"]],
    "C8": [["RankGPT", '"listwise reranking"', '"LLM reranking"'], ["retrieval"]],
    "C9": [["latency", '"response time"'], ['"web search"', '"search engine"'], ["user", "satisfaction", "engagement"]],
}
AGENT = "thesis-literature-search/1.0"


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def arxiv(out: Path) -> None:
    for sid, groups in STRINGS.items():
        clause = " AND ".join("(" + " OR ".join(f"abs:{t}" for t in g) + ")" for g in groups)
        query = f"{clause} AND (cat:cs.IR OR cat:cs.CL) AND submittedDate:[201901010000 TO 202612312359]"
        url = "https://export.arxiv.org/api/query?" + urllib.parse.urlencode(
            {"search_query": query, "start": 0, "max_results": 50, "sortBy": "relevance"})
        (out / f"arxiv-{sid}.xml").write_bytes(get(url))
        (out / f"arxiv-{sid}.query.txt").write_text(query + "\n")
        print("arxiv", sid, "ok")
        time.sleep(3.5)


def s2(out: Path) -> None:
    for sid, groups in STRINGS.items():
        query = " + ".join("(" + " | ".join(g) + ")" for g in groups)
        url = "https://api.semanticscholar.org/graph/v1/paper/search/bulk?" + urllib.parse.urlencode(
            {"query": query, "year": "2019-2026",
             "sort": "citationCount:desc",
             "fields": "title,year,venue,externalIds,abstract,publicationTypes,citationCount"})
        for attempt in range(8):
            try:
                data = json.loads(get(url))
                break
            except urllib.error.HTTPError as e:
                if e.code != 429:
                    raise
                time.sleep(10 * (attempt + 1))
        else:
            print("s2", sid, "rate-limited; skipped")
            continue
        # C1 is reviewed in full (protocol); the rest, the 50 most cited.
        data["data"] = data.get("data", []) if sid == "C1" else data.get("data", [])[:50]
        data["sort"] = "citationCount:desc"
        data["query"] = query
        (out / f"s2-{sid}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
        print("s2", sid, "total", data.get("total"))
        time.sleep(5)


if __name__ == "__main__":
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    {"arxiv": arxiv, "s2": s2}[sys.argv[2]](out)
