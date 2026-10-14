#!/usr/bin/env bash
# Captures EXPLAIN ANALYZE for the legacy and the reshaped similarity query.
# Usage: explain_vector_query.sh <database> [query text]
set -euo pipefail

DB="${1:?database name required}"
QUERY="${2:-senior backend engineer with python and aws experience}"
EMBED_URL="${EMBED_URL:-http://localhost:8000/embed}"
CONTAINER="${PG_CONTAINER:-job-posting-db}"

VEC=$(curl -s "$EMBED_URL" -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"texts":[sys.argv[1]],"type":"query"}))' "$QUERY")" \
  | python3 -c 'import json,sys; print("[" + ",".join(map(str, json.load(sys.stdin)["embeddings"][0])) + "]")')

# Plans echo the 768-d query literal; abbreviate it to keep the output readable.
psql_run() {
  docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -X -q -A \
    | sed -E "s/'\[[^]]*\]'/'[query vector]'/g"
}

echo "== database: $DB | query: $QUERY"
echo "== indexes"
echo "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'JobChunk' AND indexdef ILIKE '%embedding%';" | psql_run
echo "SELECT count(*) AS chunks FROM \"JobChunk\" WHERE embedding IS NOT NULL;" | psql_run

echo "== legacy query: ORDER BY derived similarity + threshold filter"
psql_run <<SQL
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id, "jobId", 1 - (embedding <=> '$VEC'::vector) AS similarity
FROM "JobChunk"
WHERE embedding IS NOT NULL AND 1 - (embedding <=> '$VEC'::vector) >= 0.5
ORDER BY similarity DESC LIMIT 15;
SQL

echo "== reshaped query: ORDER BY distance operator + LIMIT"
psql_run <<SQL
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT jc.id, jc."jobId", 1 - (jc.embedding <=> '$VEC'::vector) AS similarity
FROM "JobChunk" jc
WHERE jc.embedding IS NOT NULL
ORDER BY jc.embedding <=> '$VEC'::vector LIMIT 15;
SQL

echo "== reshaped query with enable_seqscan = off (forces the HNSW index)"
psql_run <<SQL
BEGIN;
SET LOCAL enable_seqscan = off;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT jc.id, jc."jobId", 1 - (jc.embedding <=> '$VEC'::vector) AS similarity
FROM "JobChunk" jc
WHERE jc.embedding IS NOT NULL
ORDER BY jc.embedding <=> '$VEC'::vector LIMIT 15;
COMMIT;
SQL

echo "== retrieval pipeline query with a structured filter (remote, salary >= 150k), iterative scan, LIMIT 50"
psql_run <<SQL
BEGIN;
SET LOCAL hnsw.iterative_scan = relaxed_order;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT jc.id, jc."jobId", 1 - (jc.embedding <=> '$VEC'::vector) AS similarity
FROM "JobChunk" jc
JOIN "Job" j ON j.id = jc."jobId"
WHERE jc.embedding IS NOT NULL
  AND j."isRemote" = true
  AND COALESCE(j."maxSalary", j."minSalary") >= 150000
ORDER BY jc.embedding <=> '$VEC'::vector LIMIT 50;
COMMIT;
SQL
