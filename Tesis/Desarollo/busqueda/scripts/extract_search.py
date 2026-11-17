"""Extract result lists from saved Google Scholar and ACM DL pages (E4).

Usage: python3 -I extract_search.py <busqueda dir> <out csv> <out totals csv>
Treats the pages as data only: regex over the HTML, no scripts executed.
"""
import csv
import html
import re
import sys
from pathlib import Path


def text(fragment: str) -> str:
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html.unescape(fragment)).strip()


def scholar(path: Path):
    s = path.read_text(encoding="utf-8", errors="replace")
    total = re.search(r'id="gs_ab_md">.*?(?:About |Aproximadamente )?([\d.,]+) result', s, re.S)
    items = []
    parts = s.split('class="gs_ri"')[1:]
    for part in parts:
        h3 = re.search(r'<h3 class="gs_rt".*?</h3>', part, re.S)
        title = text(h3.group(0)) if h3 else ""
        title = re.sub(r"^(\[(PDF|HTML|CITATION|CITAS|BOOK|LIBRO|B)\]\s*)+", "", title).strip()
        link = re.search(r'<h3 class="gs_rt".*?href="([^"]+)"', part, re.S)
        meta = re.search(r'<div class="gs_a">(.*?)</div>', part, re.S)
        meta_text = text(meta.group(1)) if meta else ""
        years = re.findall(r"\b(19\d\d|20\d\d)\b", meta_text)
        venue = meta_text.split(" - ")[1] if meta_text.count(" - ") >= 2 else ""
        venue = re.sub(r",?\s*(19|20)\d\d$", "", venue).strip()
        snippet = re.search(r'<div class="gs_rs">(.*?)</div>', part, re.S)
        items.append({"title": title, "year": years[-1] if years else "", "venue": venue,
                      "authors": meta_text.split(" - ")[0], "link": html.unescape(link.group(1)) if link else "",
                      "snippet": text(snippet.group(1)) if snippet else ""})
    return (total.group(1) if total else ""), items


def acm(path: Path):
    s = path.read_text(encoding="utf-8", errors="replace")
    total = re.search(r'class="hitsLength">\s*([\d.,]+)', s)
    items = []
    parts = re.split(r'<li class="search__item', s)[1:]
    for part in parts:
        h = re.search(r'class="issue-item__title".*?</h\d>', part, re.S)
        if not h:
            continue
        doi = re.search(r'href="https://dl\.acm\.org/doi/(10\.[^"]+)"', h.group(0))
        venue = re.search(r'class="epub-section__title">(.*?)</span>', part, re.S)
        date = re.search(r"Published:\s*([^\"<]+)", part) or re.search(
            r'class="bookPubDate[^"]*"[^>]*>(.*?)<', part, re.S)
        date_text = text(date.group(1)) if date else ""
        year = re.findall(r"(19\d\d|20\d\d)", date_text) or re.findall(r"'(\d\d):", text(venue.group(1)) if venue else "")
        y = year[-1] if year else ""
        if len(y) == 2:
            y = "20" + y
        abstract = re.search(r'class="issue-item__abstract[^"]*".*?>(.*?)</div>', part, re.S)
        authors = re.findall(r'class="hlFld-ContribAuthor">.*?<span>([^<]+)</span>', part, re.S)
        items.append({"title": text(h.group(0).split(">", 1)[1]), "year": y, "venue": text(venue.group(1)) if venue else "",
                      "authors": ", ".join(authors), "link": f"https://doi.org/{doi.group(1)}" if doi else "",
                      "snippet": text(abstract.group(1)) if abstract else ""})
    return (total.group(1) if total else ""), items


STRINGS = {
    "C1": '("retrieval-augmented generation" OR "dense retrieval"',
    "C2": '("retrieval-augmented generation" OR RAG) AND evaluation',
    "C3": '("large language model" OR LLM) AND ("relevance judgments"',
    "C4": '("assessor disagreement"',
    "C5": '(pooling OR',
    "C6": '(JobBERT OR ESCO',
    "C7": '("query expansion"',
    "C8": '(RankGPT',
    "C9": '(latency OR "response time")',
}


def identify(path: Path, base: str) -> tuple[str, int]:
    """String and page from the page itself, not from its file name."""
    import urllib.parse
    s = path.read_text(encoding="utf-8", errors="replace")
    if base == "scholar":
        q = html.unescape(re.search(r'name="q" value="([^"]*)"', s).group(1))
        cur = re.search(r'<td><b class="gs_ico gs_ico_nav_current"></b>(\d+)</td>', s)
        start = re.search(r'class="gs_ico gs_ico_nav_current"></b>(\d+)', s)
        page = int(start.group(1)) if start else None
    else:
        url = re.search(r"saved from url=\(\d+\)(\S+)", s).group(1)
        params = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        q = params["AllField"][0]
        page = int(params.get("startPage", ["0"])[0]) + 1
    string = next(k for k, v in STRINGS.items() if q.startswith(v))
    return string, page


def main() -> None:
    root, out, totals_out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    rows, totals = [], []
    for path in sorted(root.rglob("*.html")):
        m = re.match(r"(scholar|acm)-(C\d)-p(\d)\.html$", path.name)
        if not m or "_files" in str(path.parent):
            continue
        base = m.group(1)
        string, page = identify(path, base)
        if page is None:
            page = int(m.group(3))
        if (string, page) != (m.group(2), int(m.group(3))):
            print(f"{path.name}: content is {string} page {page}")
        total, items = (scholar if base == "scholar" else acm)(path)
        totals.append({"base": base, "string": string, "page": page, "total": total, "items": len(items)})
        per_page = 20 if base == "scholar" else 50
        for i, item in enumerate(items, start=1):
            rows.append({"base": base, "string": string, "rank": (page - 1) * per_page + i, **item})
    fields = ["base", "string", "rank", "title", "year", "venue", "authors", "link", "snippet"]
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    with totals_out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["base", "string", "page", "total", "items"])
        w.writeheader()
        w.writerows(totals)
    print(f"{len(rows)} results from {len(totals)} pages")


if __name__ == "__main__":
    main()
