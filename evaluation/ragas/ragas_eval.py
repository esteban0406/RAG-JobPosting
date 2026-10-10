"""Faithfulness and answer relevancy (RAGAS, Es et al. 2024) for an
eval:generate run.

Usage (inside the jobai-ragas image, host network):
    python evaluation/ragas/ragas_eval.py <generate run dir> \
        [--judge-base-url http://localhost:11434/v1] [--judge-model llama3.1:8b]

The judge is any OpenAI-compatible endpoint (API key from JUDGE_API_KEY);
answer relevancy embeds with the local e5 server, the same model the
pipeline retrieves with. Scores are cached per judge so a rerun only
evaluates new answers. Writes <run dir>/ragas-<judge>.csv.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import json
import math
import os
import urllib.request
from pathlib import Path

from openai import AsyncOpenAI
from ragas.embeddings import BaseRagasEmbedding
from ragas.llms import llm_factory
from ragas.metrics.collections import AnswerRelevancy, Faithfulness

CACHE_DIR = Path(__file__).resolve().parents[1] / "ragas-cache"


class E5Embeddings(BaseRagasEmbedding):
    """Local e5-base-v2 server; RAGAS compares questions, so the query prefix applies."""

    def __init__(self, url: str):
        super().__init__()
        self.url = url

    def _embed(self, texts: list[str]) -> list[list[float]]:
        body = json.dumps({"texts": texts, "type": "query"}).encode()
        req = urllib.request.Request(self.url, body, {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as res:
            return json.load(res)["embeddings"]

    def embed_text(self, text: str, **kwargs) -> list[float]:
        return self._embed([text])[0]

    async def aembed_text(self, text: str, **kwargs) -> list[float]:
        return await asyncio.to_thread(self.embed_text, text)

    def embed_texts(self, texts: list[str], **kwargs) -> list[list[float]]:
        return self._embed(texts)

    async def aembed_texts(self, texts: list[str], **kwargs) -> list[list[float]]:
        return await asyncio.to_thread(self._embed, texts)


def cache_key(judge: str, metric: str, row: dict) -> str:
    payload = json.dumps([judge, metric, row["question"], row["answer"], row["contexts"]])
    return hashlib.sha256(payload.encode()).hexdigest()


async def score(metric_name, metric, row, judge, cache, lock, sem):
    key = cache_key(judge, metric_name, row)
    if key in cache:
        return cache[key]["value"], cache[key].get("error")
    async with sem:
        try:
            if metric_name == "faithfulness":
                result = await metric.ascore(
                    user_input=row["question"], response=row["answer"], retrieved_contexts=row["contexts"]
                )
            else:
                result = await metric.ascore(user_input=row["question"], response=row["answer"])
            value, error = float(result.value), None
        except Exception as exc:  # recorded and reported as a NaN rate
            value, error = math.nan, f"{type(exc).__name__}: {exc}"[:300]
    entry = {"key": key, "judge": judge, "metric": metric_name, "value": value, "error": error}
    async with lock:
        cache[key] = entry
        with open(CACHE_DIR / f"{safe(judge)}.jsonl", "a") as fh:
            fh.write(json.dumps(entry) + "\n")
    return value, error


def safe(name: str) -> str:
    return "".join(c if c.isalnum() or c in ".-" else "_" for c in name)


async def main_async(args: argparse.Namespace) -> None:
    rows = [json.loads(line) for line in (args.run_dir / "answers.jsonl").read_text().splitlines() if line.strip()]
    rows = [r for r in rows if r.get("answer")][: args.limit]
    judge = f"{args.judge_base_url}|{args.judge_model}"

    CACHE_DIR.mkdir(exist_ok=True)
    cache_path = CACHE_DIR / f"{safe(judge)}.jsonl"
    cache = {}
    if cache_path.exists():
        for line in cache_path.read_text().splitlines():
            if line.strip():
                entry = json.loads(line)
                cache[entry["key"]] = entry

    client = AsyncOpenAI(base_url=args.judge_base_url, api_key=os.environ.get("JUDGE_API_KEY", "ollama"))
    llm = llm_factory(args.judge_model, provider="openai", client=client)
    metrics = {
        "faithfulness": Faithfulness(llm=llm),
        "answer_relevancy": AnswerRelevancy(llm=llm, embeddings=E5Embeddings(args.embed_url)),
    }
    lock, sem = asyncio.Lock(), asyncio.Semaphore(args.concurrency)

    async def evaluate_row(row):
        out = {"queryId": row["queryId"], "category": row.get("category"), "lang": row.get("lang")}
        for name, metric in metrics.items():
            out[name], out[f"{name}_error"] = await score(name, metric, row, judge, cache, lock, sem)
        return out

    results = await asyncio.gather(*(evaluate_row(r) for r in rows))
    out_path = args.run_dir / f"ragas-{safe(args.judge_model)}.csv"
    with open(out_path, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(results[0].keys()))
        writer.writeheader()
        writer.writerows(results)

    for name in metrics:
        values = [r[name] for r in results]
        valid = [v for v in values if not math.isnan(v)]
        mean = sum(valid) / len(valid) if valid else math.nan
        print(f"{name}: mean={mean:.3f} n={len(valid)} nan_rate={1 - len(valid) / len(values):.1%}")
    print(f"Written to {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--judge-base-url", default="http://localhost:11434/v1")
    parser.add_argument("--judge-model", default="llama3.1:8b")
    parser.add_argument("--embed-url", default="http://localhost:8000/embed")
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--limit", type=int)
    asyncio.run(main_async(parser.parse_args()))


if __name__ == "__main__":
    main()
