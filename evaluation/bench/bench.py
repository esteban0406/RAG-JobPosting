"""pgvector vs. Qdrant benchmark (ANN-Benchmarks style, Aumüller et al. 2020).

Runs inside the analysis container with host networking (see run_bench.sh).
Steps, each a subcommand:

    export   real JobChunk vectors and job attributes from the snapshot database
    queries  embed the benchmark queries with the local e5 server
    synth    synthetic datasets calibrated against the real nearest-neighbour
             similarity distribution (reports the KS statistic)
    truth    exact top-100 neighbours per query, unfiltered and per filter
    load     load a dataset into one engine and build its HNSW index (timed)
    run      sweep ef_search and filters; recall@10, latency, QPS, completeness
    report   median over repetitions; recall-latency figures

Both engines use the same HNSW parameters (m=16, ef_construction=128) and the
same integer ids, so results are directly comparable.
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
RESULTS = ROOT / "results"
DIM = 768
HNSW_M = 16
HNSW_EF_CONSTRUCTION = 128
K = 10
TRUTH_DEPTH = 100
# Filters select payload "bucket" < threshold; buckets are uniform in [0, 100),
# so the threshold is the selectivity in percent.
FILTERS = {"none": None, "50pct": 50, "10pct": 10, "1pct": 1}


# ---------------------------------------------------------------- data prep


def normalize(x: np.ndarray) -> np.ndarray:
    return (x / np.linalg.norm(x, axis=1, keepdims=True)).astype(np.float32)


def cmd_export(args: argparse.Namespace) -> None:
    import psycopg
    from pgvector.psycopg import register_vector

    with psycopg.connect(args.db_url) as conn:
        register_vector(conn)
        rows = conn.execute(
            """
            SELECT jc.embedding, j."minSalary", j."jobType", j."isRemote"
            FROM "JobChunk" jc JOIN "Job" j ON j.id = jc."jobId"
            WHERE jc.embedding IS NOT NULL ORDER BY jc.id
            """
        ).fetchall()
    # pgvector >= 0.5 returns Vector objects rather than numpy arrays.
    vectors = normalize(np.array([np.asarray(r[0].to_list()) for r in rows], dtype=np.float32))
    DATA.mkdir(parents=True, exist_ok=True)
    np.savez(
        DATA / "real.npz",
        vectors=vectors,
        min_salary=np.array([r[1] if r[1] is not None else -1 for r in rows], dtype=np.int32),
        job_type=np.array([r[2] or "" for r in rows]),
        is_remote=np.array([bool(r[3]) for r in rows]),
    )
    print(f"exported {len(rows)} real vectors")


def embed(texts: list[str], url: str) -> np.ndarray:
    out = []
    for i in range(0, len(texts), 64):
        body = json.dumps({"texts": texts[i : i + 64], "type": "query"}).encode()
        req = urllib.request.Request(url, body, {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as res:
            out.extend(json.load(res)["embeddings"])
    return normalize(np.array(out, dtype=np.float32))


def cmd_queries(args: argparse.Namespace) -> None:
    import psycopg

    texts: list[str] = []
    if args.dataset:
        for line in Path(args.dataset).read_text().splitlines():
            if line.strip() and not line.startswith("//"):
                texts.append(json.loads(line)["text"])
    with psycopg.connect(args.db_url) as conn:
        titles = conn.execute(
            'SELECT title FROM (SELECT DISTINCT title FROM "Job") t ORDER BY md5(title) LIMIT %s',
            (args.titles,),
        ).fetchall()
    texts += [t[0] for t in titles]
    np.save(DATA / "queries.npy", embed(texts, args.embed_url))
    (DATA / "queries.json").write_text(json.dumps(texts, indent=1))
    print(f"embedded {len(texts)} queries")


def nn_similarity(sample: np.ndarray, base: np.ndarray) -> np.ndarray:
    """Similarity of each sample vector to its nearest neighbour in base, where
    sample[i] is base[i] (the self match is skipped)."""
    return np.sort(np.partition(sample @ base.T, -2, axis=1)[:, -2])


def synthesize(
    real: np.ndarray, n: int, sigma: float, rng: np.random.Generator, out: np.ndarray | None = None
) -> tuple[np.ndarray, np.ndarray]:
    """Interpolates two real vectors and adds per-dimension Gaussian noise,
    in blocks so 500k+ vectors fit in memory (writes into `out` if given)."""
    std = real.std(axis=0)
    vectors = out if out is not None else np.empty((n, DIM), dtype=np.float32)
    seeds = np.empty(n, dtype=np.int64)
    for start in range(0, n, 50_000):
        m = min(50_000, n - start)
        a = rng.integers(0, len(real), m)
        b = rng.integers(0, len(real), m)
        lam = rng.uniform(0.7, 1.0, (m, 1)).astype(np.float32)
        noise = rng.standard_normal((m, DIM), dtype=np.float32) * std * sigma
        vectors[start : start + m] = normalize(lam * real[a] + (1 - lam) * real[b] + noise)
        seeds[start : start + m] = a
    return vectors, seeds


def cmd_synth(args: argparse.Namespace) -> None:
    from scipy.stats import ks_2samp

    rng = np.random.default_rng(args.seed)
    real_npz = np.load(DATA / "real.npz")
    real = real_npz["vectors"]
    probe = min(2000, len(real))
    # Calibrate at the real corpus size so densities are comparable.
    real_nn = nn_similarity(real[:probe], real)
    best: tuple[float, float] | None = None

    def try_sigma(sigma: float) -> None:
        nonlocal best
        cand, _ = synthesize(real, len(real), sigma, np.random.default_rng(args.seed))
        cand_nn = nn_similarity(cand[:probe], cand)
        ks = float(ks_2samp(real_nn, cand_nn).statistic)
        print(f"sigma={sigma:<5.2f} KS={ks:.4f} median NN sim real={np.median(real_nn):.4f} synth={np.median(cand_nn):.4f}")
        if best is None or ks < best[1]:
            best = (sigma, ks)

    # Coarse grid, then refine around the best value.
    for sigma in [0.0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0]:
        try_sigma(sigma)
    center = best[0]
    for sigma in np.arange(max(0.0, center - 0.2), center + 0.25, 0.05):
        try_sigma(round(float(sigma), 2))
    sigma, ks = best

    name = f"synth-{args.n}"
    out = np.lib.format.open_memmap(DATA / f"{name}.npy", mode="w+", dtype=np.float32, shape=(args.n, DIM))
    _, seeds = synthesize(real, args.n, sigma, rng, out)
    out.flush()
    np.savez(
        DATA / f"{name}-payload.npz",
        min_salary=real_npz["min_salary"][seeds],
        job_type=real_npz["job_type"][seeds],
        is_remote=real_npz["is_remote"][seeds],
        bucket=rng.integers(0, 100, args.n).astype(np.int16),
    )
    meta = {"name": name, "n": args.n, "sigma": sigma, "ks": ks, "seed": args.seed}
    (DATA / f"{name}.json").write_text(json.dumps(meta, indent=2))
    print(f"chosen sigma={sigma} (KS={ks:.4f}); wrote {name}")


def load_dataset(name: str) -> tuple[np.ndarray, np.ndarray]:
    if name == "real":
        npz = np.load(DATA / "real.npz")
        vectors = npz["vectors"]
        bucket_path = DATA / "real-bucket.npy"
        if not bucket_path.exists():
            np.save(bucket_path, np.random.default_rng(7).integers(0, 100, len(vectors)).astype(np.int16))
        return vectors, np.load(bucket_path)
    vectors = np.load(DATA / f"{name}.npy", mmap_mode="r")
    return vectors, np.load(DATA / f"{name}-payload.npz")["bucket"]


def cmd_truth(args: argparse.Namespace) -> None:
    vectors, bucket = load_dataset(args.dataset)
    queries = np.load(DATA / "queries.npy")
    out = {}
    for fname, threshold in FILTERS.items():
        best_sim = np.full((len(queries), TRUTH_DEPTH), -np.inf, dtype=np.float32)
        best_idx = np.full((len(queries), TRUTH_DEPTH), -1, dtype=np.int64)
        for start in range(0, len(vectors), 100_000):
            block = np.asarray(vectors[start : start + 100_000])
            sims = queries @ block.T
            if threshold is not None:
                sims[:, bucket[start : start + len(block)] >= threshold] = -np.inf
            ids = np.broadcast_to(np.arange(start, start + len(block)), sims.shape)
            all_sims = np.concatenate([best_sim, sims], axis=1)
            all_ids = np.concatenate([best_idx, ids], axis=1)
            top = np.argpartition(-all_sims, TRUTH_DEPTH, axis=1)[:, :TRUTH_DEPTH]
            best_sim = np.take_along_axis(all_sims, top, axis=1)
            best_idx = np.take_along_axis(all_ids, top, axis=1)
        order = np.argsort(-best_sim, axis=1)
        idx = np.take_along_axis(best_idx, order, axis=1)
        # Fewer than TRUTH_DEPTH vectors may pass a selective filter.
        idx[np.take_along_axis(best_sim, order, axis=1) == -np.inf] = -1
        out[fname] = idx
        print(f"{args.dataset} {fname}: done")
    np.savez(DATA / f"truth-{args.dataset}.npz", **out)


# ---------------------------------------------------------------- engines


def table(name: str) -> str:
    return "bench_" + name.replace("-", "_")


def cmd_load(args: argparse.Namespace) -> None:
    vectors, bucket = load_dataset(args.dataset)
    n = len(vectors)
    result = {"engine": args.engine, "dataset": args.dataset, "n": n}
    if args.engine == "pgvector":
        import psycopg
        from pgvector.psycopg import register_vector

        with psycopg.connect(args.db_url, autocommit=True) as conn:
            conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            register_vector(conn)
            t = table(args.dataset)
            conn.execute(f"DROP TABLE IF EXISTS {t}")
            conn.execute(f"CREATE TABLE {t} (id int PRIMARY KEY, embedding vector({DIM}), bucket smallint)")
            conn.execute(f"ALTER TABLE {t} ALTER COLUMN embedding SET STORAGE PLAIN")
            t0 = time.perf_counter()
            with conn.cursor().copy(f"COPY {t} (id, embedding, bucket) FROM STDIN WITH (FORMAT BINARY)") as copy:
                copy.set_types(["int4", "vector", "int2"])
                for i in range(n):
                    copy.write_row((i, np.asarray(vectors[i]), int(bucket[i])))
            result["load_s"] = time.perf_counter() - t0
            conn.execute(f"CREATE INDEX ON {t} (bucket)")
            conn.execute(f"SET maintenance_work_mem = '{args.maintenance_work_mem}'")
            conn.execute(f"SET max_parallel_maintenance_workers = {args.parallel_workers}")
            t0 = time.perf_counter()
            conn.execute(
                f"CREATE INDEX {t}_hnsw ON {t} USING hnsw (embedding vector_cosine_ops) "
                f"WITH (m = {HNSW_M}, ef_construction = {HNSW_EF_CONSTRUCTION})"
            )
            result["index_s"] = time.perf_counter() - t0
            conn.execute(f"ANALYZE {t}")
            result["index_bytes"] = conn.execute(f"SELECT pg_relation_size('{t}_hnsw')").fetchone()[0]
            result["table_bytes"] = conn.execute(f"SELECT pg_total_relation_size('{t}')").fetchone()[0]
    else:
        from qdrant_client import QdrantClient, models

        client = QdrantClient(url=args.qdrant_url, prefer_grpc=True, timeout=600)
        c = table(args.dataset)
        if client.collection_exists(c):
            client.delete_collection(c)
        client.create_collection(
            c,
            vectors_config=models.VectorParams(size=DIM, distance=models.Distance.COSINE, on_disk=False),
            hnsw_config=models.HnswConfigDiff(m=HNSW_M, ef_construct=HNSW_EF_CONSTRUCTION),
            optimizers_config=models.OptimizersConfigDiff(indexing_threshold=10, default_segment_number=2),
        )
        client.create_payload_index(c, "bucket", models.PayloadSchemaType.INTEGER)
        t0 = time.perf_counter()
        client.upload_collection(
            c,
            vectors=np.asarray(vectors),
            payload=({"bucket": int(b)} for b in bucket),
            ids=range(n),
            batch_size=1024,
            parallel=4,
            wait=True,
        )
        result["load_s"] = time.perf_counter() - t0
        while True:
            info = client.get_collection(c)
            if info.status == models.CollectionStatus.GREEN and (info.indexed_vectors_count or 0) >= (info.points_count or 0):
                break
            time.sleep(1)
        result["index_s"] = time.perf_counter() - t0 - result["load_s"]
        result["points"] = info.points_count
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / f"load-{args.engine}-{args.dataset}.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


class PgSearcher:
    def __init__(self, db_url: str, dataset: str, ef: int, threshold: int | None, iterative: str):
        import psycopg
        from pgvector.psycopg import register_vector

        self.conn = psycopg.connect(db_url, autocommit=True)
        register_vector(self.conn)
        self.conn.execute(f"SET hnsw.ef_search = {ef}")
        self.conn.execute(f"SET hnsw.iterative_scan = {iterative}")
        where = f"WHERE bucket < {threshold}" if threshold is not None else ""
        if threshold is None:
            # Without a filter, measure the HNSW index even where the planner
            # would prefer a sequential scan (small tables).
            self.conn.execute("SET enable_seqscan = off")
        self.sql = f"SELECT id FROM {table(dataset)} {where} ORDER BY embedding <=> %s LIMIT {K}"

    def plan(self, q: np.ndarray) -> str:
        text = "\n".join(r[0] for r in self.conn.execute("EXPLAIN " + self.sql, (q,)).fetchall())
        if "_hnsw" in text:
            return "hnsw"
        if "bucket_idx" in text:
            return "btree+sort"
        return "seqscan"

    def search(self, q: np.ndarray) -> list[int]:
        return [r[0] for r in self.conn.execute(self.sql, (q,)).fetchall()]


class QdrantSearcher:
    def __init__(self, url: str, dataset: str, ef: int, threshold: int | None):
        from qdrant_client import QdrantClient, models

        self.client = QdrantClient(url=url, prefer_grpc=True)
        self.collection = table(dataset)
        self.params = models.SearchParams(hnsw_ef=ef, exact=False)
        self.filter = (
            models.Filter(must=[models.FieldCondition(key="bucket", range=models.Range(lt=threshold))])
            if threshold is not None
            else None
        )

    def plan(self, q: np.ndarray) -> str:
        return "qdrant"

    def search(self, q: np.ndarray) -> list[int]:
        res = self.client.query_points(
            self.collection, query=q.tolist(), limit=K, query_filter=self.filter,
            search_params=self.params, with_payload=False,
        )
        return [int(p.id) for p in res.points]


def make_searcher(args, ef, threshold, iterative):
    if args.engine == "pgvector":
        return PgSearcher(args.db_url, args.dataset, ef, threshold, iterative)
    return QdrantSearcher(args.qdrant_url, args.dataset, ef, threshold)


def cmd_run(args: argparse.Namespace) -> None:
    queries = np.load(DATA / "queries.npy")
    truth = np.load(DATA / f"truth-{args.dataset}.npz")
    iteratives = args.iterative.split(",") if args.engine == "pgvector" else ["n/a"]
    rows = []
    for fname in args.filters.split(","):
        threshold = FILTERS[fname]
        gt = [set(t[:K][t[:K] >= 0].tolist()) for t in truth[fname]]
        for iterative in iteratives:
            if fname == "none" and iterative not in ("off", "n/a"):
                continue
            for ef in [int(e) for e in args.ef.split(",")]:
                for rep in range(args.repeats):
                    searcher = make_searcher(args, ef, threshold, iterative)
                    for q in queries:  # warm-up
                        searcher.search(q)
                    lat, hits, complete = [], 0, 0
                    for i, q in enumerate(queries):
                        t0 = time.perf_counter()
                        res = searcher.search(q)
                        lat.append((time.perf_counter() - t0) * 1000)
                        hits += len(gt[i] & set(res))
                        complete += len(res) == K
                    searchers = [make_searcher(args, ef, threshold, iterative) for _ in range(args.clients)]
                    chunks = np.array_split(np.arange(len(queries)), args.clients)
                    t0 = time.perf_counter()
                    with ThreadPoolExecutor(args.clients) as pool:
                        list(pool.map(lambda s, idx: [s.search(queries[j]) for j in idx], searchers, chunks))
                    qps_multi = len(queries) / (time.perf_counter() - t0)
                    row = {
                        "engine": args.engine, "dataset": args.dataset, "filter": fname,
                        "iterative": iterative, "ef": ef, "repeat": rep,
                        "recall": hits / sum(len(g) for g in gt),
                        "p50_ms": float(np.percentile(lat, 50)), "p95_ms": float(np.percentile(lat, 95)),
                        "p99_ms": float(np.percentile(lat, 99)),
                        "qps_1": 1000 / float(np.mean(lat)), f"qps_{args.clients}": qps_multi,
                        "completeness": complete / len(queries), "plan": searcher.plan(queries[0]),
                    }
                    rows.append(row)
                    print(json.dumps(row))
    RESULTS.mkdir(parents=True, exist_ok=True)
    out = RESULTS / f"run-{args.engine}-{args.dataset}.jsonl"
    out.write_text("\n".join(json.dumps(r) for r in rows) + "\n")


def cmd_report(args: argparse.Namespace) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import pandas as pd

    frames = [pd.read_json(p, lines=True) for p in sorted(RESULTS.glob("run-*.jsonl"))]
    df = pd.concat(frames)
    keys = ["engine", "dataset", "filter", "iterative", "ef"]
    median = df.groupby(keys).median(numeric_only=True).reset_index().drop(columns="repeat")
    plans = df.groupby(keys)["plan"].agg(lambda s: s.mode().iat[0]).reset_index()
    median = median.merge(plans, on=keys)
    median.to_csv(RESULTS / "summary.csv", index=False)
    for (dataset, fname), group in median.groupby(["dataset", "filter"]):
        fig, ax = plt.subplots(figsize=(5, 3.5))
        for (engine, iterative), g in group.groupby(["engine", "iterative"]):
            label = engine if iterative in ("n/a", "off") else f"{engine} ({iterative})"
            g = g.sort_values("ef")
            ax.plot(g["recall"], g["p50_ms"], marker="o", label=label)
        ax.set_xlabel("recall@10")
        ax.set_ylabel("latencia p50 (ms)")
        ax.set_title(f"{dataset}, filtro {fname}")
        ax.grid(alpha=0.3)
        ax.legend()
        fig.tight_layout()
        fig.savefig(RESULTS / f"recall-latency-{dataset}-{fname}.pdf")
        plt.close(fig)
    print(median.to_string(index=False))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db-url", default="postgresql://postgres:postgres@localhost:5432/bench")
    parser.add_argument("--qdrant-url", default="http://localhost:6333")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("export")
    p.set_defaults(func=cmd_export)
    p = sub.add_parser("queries")
    p.add_argument("--dataset")
    p.add_argument("--titles", type=int, default=900)
    p.add_argument("--embed-url", default="http://localhost:8000/embed")
    p.set_defaults(func=cmd_queries)
    p = sub.add_parser("synth")
    p.add_argument("--n", type=int, required=True)
    p.add_argument("--seed", type=int, default=42)
    p.set_defaults(func=cmd_synth)
    p = sub.add_parser("truth")
    p.add_argument("--dataset", required=True)
    p.set_defaults(func=cmd_truth)
    p = sub.add_parser("load")
    p.add_argument("--engine", choices=["pgvector", "qdrant"], required=True)
    p.add_argument("--dataset", required=True)
    p.add_argument("--maintenance-work-mem", default="3GB")
    p.add_argument("--parallel-workers", type=int, default=7)
    p.set_defaults(func=cmd_load)
    p = sub.add_parser("run")
    p.add_argument("--engine", choices=["pgvector", "qdrant"], required=True)
    p.add_argument("--dataset", required=True)
    p.add_argument("--ef", default="16,32,64,128,256,512")
    p.add_argument("--filters", default="none,50pct,10pct,1pct")
    p.add_argument("--iterative", default="off,relaxed_order")
    p.add_argument("--clients", type=int, default=8)
    p.add_argument("--repeats", type=int, default=3)
    p.set_defaults(func=cmd_run)
    p = sub.add_parser("report")
    p.set_defaults(func=cmd_report)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
