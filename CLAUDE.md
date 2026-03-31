# CLAUDE.md — Job Posting RAG System

## Project Goal

Portfolio project: a RAG-powered job search assistant. Users query a natural-language search endpoint and get an LLM-generated answer grounded in real job postings retrieved via vector similarity.

Deployment target: personal VPS. Built to stay within Gemini free-tier limits.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11, TypeScript 5.7 |
| HTTP server | Express (via NestJS) |
| Database | PostgreSQL 16 + pgvector extension |
| ORM | Prisma 7.5 |
| Vector dims | 768 |
| Dev embeddings | Python FastAPI + `intfloat/e5-base-v2` (Docker, port 8000) |
| Prod embeddings | Google Gemini `gemini-embedding-001` |
| LLM | Google Gemini `gemini-3.1-flash-lite-preview` (15 RPM, 1500 req/day) |
| Cache | Redis (via NestJS CacheManager) |
| Package manager | pnpm |
| Container | Docker Compose (Postgres + embedding server) |

---

## Repository Layout

```
/
├── backend/                  NestJS application
│   ├── src/                  All source code
│   ├── prisma/schema.prisma  DB schema (no vector column — see note below)
│   ├── .env                  Local config (never commit secrets)
│   └── package.json
├── embedding-server/         Python FastAPI local embedding server
│   ├── main.py
│   └── dockerfile
├── docker-compose.yml        PostgreSQL 16 + embedding server
└── docs/                     Developer notes
```

---

## Module Map (`backend/src/`)

| Module | Responsibility |
|---|---|
| `config/` | Env var validation schema (class-validator) |
| `storage/` | `PrismaService`, `JobRepository`, `VectorRepository` |
| `embedding/` | `EmbeddingService` — dual provider (local FastAPI or Gemini) |
| `llm/` | `LlmService` — Gemini text generation, retries, exponential backoff |
| `ingestion/` | Fetch → dedupe → embed pipeline; 6h cron scheduler; CSV export |
| `rag/` | `RagService` — embed query → vector search → build prompt → LLM |
| `query/` | `QueryController` — `POST /api/v1/jobs/search` (public, rate-limited) |
| `auth/` | JWT auth — `POST /api/v1/auth/login` via `ADMIN_API_KEY` |
| `eval/` | Benchmarks RAG quality (see Eval Module section) |
| `health/` | NestJS Terminus liveness probe |

**Dependency flow:**
```
IngestionModule → StorageModule ← RagModule ← QueryModule
                     ↑                ↑
               EmbeddingModule    LlmModule
                     ↑
               CacheModule (global)
```

---

## Key Architectural Decisions

### Dual Embedding Provider
- `NODE_ENV=development` → local FastAPI server (`http://localhost:8000`)
- `NODE_ENV=production` → Gemini API
- Local provider prefixes queries with `"query: "` for asymmetric e5-base-v2 search
- Both produce 768-dimensional vectors — same pgvector column

### Rate-Limit-Aware Ingestion Queue
- `p-queue` wraps all embedding calls during ingestion
- Gemini mode: 1 concurrent, 2-second interval (stays under 30 RPM soft limit)
- Local mode: 5 concurrent (no external limit)

### Content-Hash Deduplication
- SHA256 of `title|company|description|location`
- Checked before upsert; avoids re-embedding identical postings across cron runs
- Essential for staying within Gemini daily quota

### pgvector Column Is Outside Prisma
Prisma schema defines `JobChunk` without the embedding column. The column is added via a raw SQL migration:
```sql
ALTER TABLE "JobChunk" ADD COLUMN embedding vector(768);
CREATE INDEX ON "JobChunk" USING ivfflat (embedding vector_cosine_ops);
```
`VectorRepository` uses `$queryRaw` / `$executeRaw` for all vector operations.

### Retrieval Threshold
Cosine similarity threshold = **0.5**. If no chunks exceed it, the pipeline returns "no relevant jobs found" and skips the LLM call entirely (saves quota).

### Caching
Embeddings are cached in Redis for 7 days using the SHA256 of the content as the key. RAG responses are not cached yet.

---

## API Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/jobs/search` | None | Main RAG query; rate-limited 10/min |
| POST | `/api/v1/auth/login` | None | Exchange `ADMIN_API_KEY` for JWT |
| POST | `/api/v1/ingestion/trigger` | JWT | Async; returns 202 |
| GET | `/api/v1/ingestion/export` | JWT | CSV of all jobs |
| GET | `/api/v1/eval/label` | None | View auto-labeled queries |
| POST | `/api/v1/eval/run` | None | Run evaluation; returns metrics |
| GET | `/api/v1/health` | None | Liveness probe |

---

## Eval Module (current development focus)

Located in `backend/src/eval/`.

### Files
- [`eval/queries.dataset.ts`](backend/src/eval/dataset/queries.dataset.ts) — 13 hardcoded test queries with expected keyword groups
- [`eval/labeling.service.ts`](backend/src/eval/labeling.service.ts) — auto-labels which jobs are relevant for each query via keyword matching
- [`eval/eval.service.ts`](backend/src/eval/eval.service.ts) — runs queries through the RAG retrieval step and computes metrics

### Query Categories
| Category | Count | Purpose |
|---|---|---|
| `exact` | 3 | Keyword baseline |
| `semantic` | 3 | Test embedding quality |
| `filtering` | 3 | Location/job-type signals |
| `aggregation` | 2 | Diversity of retrieval |
| `noisy` | 2 | Realistic vague queries |

### Labeling Logic
Keywords can be flat (OR logic) or grouped (AND between groups, OR within each group). Word-boundary regex prevents "java" from matching "javascript". Jobs are scored (2pt title match, 1pt description match) and the top 20 are returned as relevant.

### Metrics
- **Recall@K** — % of labeled-relevant jobs found in top-K
- **Precision@K** — % of retrieved jobs that are labeled relevant
- **MRR** — Mean Reciprocal Rank (rank of first relevant result)

Reported per-query and per-category.

---

## Running the Project

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Backend (always source nvm first in new shells)
cd backend
source ~/.nvm/nvm.sh && nvm use
pnpm install
pnpm run start:dev

# 3. Run tests
pnpm test
```

---

## Environment Variables (`backend/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `GEMINI_API_KEY` | Google Gemini API key (required in production) |
| `LOCAL_EMBEDDING_URL` | Local FastAPI server URL (default: `http://localhost:8000`) |
| `LLM_MODEL` | Gemini model ID |
| `JWT_SECRET` | Secret for JWT signing (min 32 chars) |
| `ADMIN_API_KEY` | API key to obtain a JWT |
| `JWT_EXPIRES_IN` | Token TTL (default: `24h`) |
| `INGESTION_CRON` | Cron expression (default: `0 */6 * * *`) |

---

## Conventions for Agents

- **File reading**: use `Read`, `Grep`, `Glob` tools — never shell `cat`/`grep`/`find`
- **Running node/pnpm**: always `source ~/.nvm/nvm.sh` before any node/pnpm command in Bash tool
- **Scope discipline**: do not add features, refactor, or improve beyond what is explicitly requested
- **Eval module**: check `queries.dataset.ts` and `labeling.service.ts` for current state before modifying — this module is actively evolving
- **Vector operations**: use raw SQL via Prisma `$queryRaw`/`$executeRaw`; do not add the embedding column to `schema.prisma`
- **Rate limits**: ingestion queue config in `IngestionService` — do not increase Gemini concurrency above 1
