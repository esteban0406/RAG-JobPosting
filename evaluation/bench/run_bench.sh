#!/usr/bin/env bash
# Orchestrates the pgvector vs. Qdrant benchmark on the host.
# Usage: evaluation/bench/run_bench.sh <dataset> [<dataset> ...]
#   datasets: real | synth-<n> (create them first with bench.py export/queries/synth)
# Run from the repository root, with ingestion stopped. Each engine runs alone,
# capped at the same CPU and memory; Postgres gets shared_buffers sized like
# Qdrant's in-memory index for the duration of the benchmark.
set -euo pipefail

CPUS="${BENCH_CPUS:-8}"
MEMORY="${BENCH_MEMORY:-10g}"
PG=job-posting-db
QD=job-posting-qdrant
RESULTS=evaluation/bench/results

bench() {
  docker run --rm --network host --user "$(id -u):$(id -g)" -e PYTHONUNBUFFERED=1 \
    -v "$PWD":/work -w /work jobai-analysis python evaluation/bench/bench.py "$@"
}

record_container() {  # <container> <file>: peak memory (cgroup v2) and current usage
  local peak
  peak=$(docker exec "$1" sh -c 'cat /sys/fs/cgroup/memory.peak 2>/dev/null || echo -1')
  docker stats --no-stream --format '{"container":"{{.Name}}","mem":"{{.MemUsage}}"}' "$1" \
    | sed "s/}\$/,\"peak_bytes\":$peak}/" > "$2"
}

mkdir -p "$RESULTS"
docker exec "$PG" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='bench'" | grep -q 1 \
  || docker exec "$PG" createdb -U postgres bench

for dataset in "$@"; do
  [ -f "evaluation/bench/data/truth-$dataset.npz" ] || bench truth --dataset "$dataset"

  # pgvector alone
  docker stop "$QD" >/dev/null
  docker exec "$PG" psql -U postgres -qc "ALTER SYSTEM SET shared_buffers = '4GB'"
  docker update --cpus "$CPUS" --memory "$MEMORY" --memory-swap "$MEMORY" "$PG" >/dev/null
  docker restart "$PG" >/dev/null && until docker exec "$PG" pg_isready -U postgres -q; do sleep 1; done
  bench load --engine pgvector --dataset "$dataset"
  bench run --engine pgvector --dataset "$dataset"
  record_container "$PG" "$RESULTS/mem-pgvector-$dataset.json"
  docker exec "$PG" psql -U postgres -qc "ALTER SYSTEM RESET shared_buffers"
  docker restart "$PG" >/dev/null && until docker exec "$PG" pg_isready -U postgres -q; do sleep 1; done

  # Qdrant alone: Postgres is stopped so both engines get the same idle machine
  docker stop "$PG" >/dev/null
  docker start "$QD" >/dev/null
  docker update --cpus "$CPUS" --memory "$MEMORY" --memory-swap "$MEMORY" "$QD" >/dev/null
  docker restart "$QD" >/dev/null
  until curl -sf localhost:6333/readyz >/dev/null; do sleep 1; done
  bench load --engine qdrant --dataset "$dataset"
  bench run --engine qdrant --dataset "$dataset"
  record_container "$QD" "$RESULTS/mem-qdrant-$dataset.json"
  docker exec "$QD" du -sb "/qdrant/storage/collections/bench_${dataset//-/_}" \
    > "$RESULTS/disk-qdrant-$dataset.txt"
  docker start "$PG" >/dev/null && until docker exec "$PG" pg_isready -U postgres -q; do sleep 1; done
done

bench report
