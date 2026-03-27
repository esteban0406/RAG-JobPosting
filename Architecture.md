# NestJS RAG System Architecture — Job Postings

## Overview

This document describes the recommended module architecture for a NestJS-based Retrieval-Augmented Generation (RAG) system for job postings. External job APIs feed the database, embeddings are stored in a vector store, and a RAG pipeline answers user queries with LLM-generated responses grounded in real job data.

**AI provider stack:** Google Gemini API (free tier) for both LLM and embeddings. This keeps the entire AI layer on a single API key with no infrastructure overhead, which is the right trade-off for a shared VPS environment. The modules are designed to be provider-agnostic — switching to a different provider is a config change, not a refactor.

---

## Project Structure

```
src/
├── app.module.ts
├── ingestion/
│   ├── ingestion.module.ts
│   ├── ingestion.service.ts
│   ├── ingestion.scheduler.ts
│   ├── providers/
│   │   ├── adzuna.provider.ts
│   │   └── arbeitnow.provider.ts
│   └── dto/
│       └── raw-job.dto.ts
├── storage/
│   ├── storage.module.ts
│   ├── job.repository.ts
│   ├── vector.repository.ts
│   └── entities/
│       └── job.entity.ts
├── embedding/
│   ├── embedding.module.ts
│   ├── embedding.service.ts
│   └── dto/
│       └── embed-request.dto.ts
├── rag/
│   ├── rag.module.ts
│   ├── rag.service.ts
│   └── dto/
│       └── rag-response.dto.ts
├── llm/
│   ├── llm.module.ts
│   ├── llm.service.ts
│   └── dto/
│       └── completion-request.dto.ts
├── query/
│   ├── query.module.ts
│   ├── query.controller.ts
│   ├── query.service.ts
│   └── dto/
│       ├── search-query.dto.ts
│       └── search-response.dto.ts
├── auth/
│   ├── auth.module.ts
│   ├── auth.service.ts
│   ├── guards/
│   │   └── jwt.guard.ts
│   └── decorators/
│       └── roles.decorator.ts
└── cache/
    ├── cache.module.ts
    └── cache.service.ts
```

---

## Modules

### 1. IngestionModule

**Responsibility:** Pull job postings from external APIs, normalize them into a unified schema, deduplicate, and hand them off to `StorageModule` and `EmbeddingModule`.

**Key files:**
- `ingestion.service.ts` — orchestrates fetch → normalize → deduplicate → store
- `ingestion.scheduler.ts` — cron jobs via `@nestjs/schedule`
- `providers/` — one file per external API (Adzuna, Arbeitnow, RapidAPI, etc.)

**Good practices:**
- Use a **queue** (`@nestjs/bull` + Redis) to decouple HTTP fetching from the embedding step. This is critical, not optional — when ingesting hundreds of job postings on first run, you must drip them through the Gemini embedding API respecting its rate limit rather than firing them all at once and getting blocked.
- **Deduplicate before embedding.** Hash the normalized job content (title + description + company + location). If the hash matches a stored record, skip re-embedding entirely. This is your primary defence against hitting free tier limits.
- Implement **provider adapters** behind a common interface (`JobProvider`). Adding a new API source means adding one adapter file, not touching orchestration logic.
- Store a `fetchedAt` timestamp and `sourceId` on every record so you can audit freshness and avoid double-ingestion across scheduler runs.
- Use **exponential backoff with jitter** when external APIs return 429s.

```typescript
// Example interface for provider adapters
interface JobProvider {
  fetchJobs(params: FetchParams): Promise<RawJobDto[]>;
}
```

---

### 2. StorageModule

**Responsibility:** Persist structured job data (PostgreSQL) and vector embeddings (pgvector). Expose repository methods to other modules.

**Key files:**
- `job.repository.ts` — CRUD for the `jobs` table (Prisma)
- `vector.repository.ts` — upsert and similarity-search methods for pgvector

**Good practices:**
- Use **pgvector** inside your existing Postgres instance — no separate vector database needed. This eliminates an infrastructure dependency and is a legitimate production choice (Supabase runs on it at scale). Configure the 768-dimensional index to match `text-embedding-004`.
- Expose a **clean repository interface** — other modules should never touch raw SQL or ORM queries directly.
- Add a **composite index** on `(source_id, content_hash)` for fast deduplication lookups.
- Use **transactions** when writing a job record and its vector together, so you never have a job with no embedding or an orphaned vector.
- Keep `StorageModule` as a **shared module** (`exports: [JobRepository, VectorRepository]`). Both `IngestionModule` and `RagModule` depend on it.

```typescript
// vector.repository.ts — similarity search signature
async findSimilar(queryVector: number[], topK: number): Promise<JobChunk[]>
```

**pgvector migration:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
-- 768 dimensions to match text-embedding-004
ALTER TABLE job_chunks ADD COLUMN embedding vector(768);
CREATE INDEX ON job_chunks USING ivfflat (embedding vector_cosine_ops);
```

---

### 3. EmbeddingModule

**Responsibility:** Convert text into vector representations using Google's `text-embedding-004` model via the Gemini API free tier. Used by both `IngestionModule` (at write time) and `RagModule` (at query time).

**Provider:** `text-embedding-004` — 768-dimensional vectors, strong benchmark performance competitive with OpenAI's `text-embedding-ada-002`, and free under the Google AI free tier.

**Key files:**
- `embedding.service.ts` — wraps the Gemini embedding API, exposes `embed(text: string): Promise<number[]>`

**Good practices:**
- Keep this module **thin and provider-agnostic**. The service should wrap the provider behind a single method. Switching to a different embedding provider should require changing only this file and the vector dimension in your pgvector schema.
- **Chunk job postings before embedding.** Embed title + a truncated description (~512 tokens). Long documents embedded as a single vector lose semantic precision.
- Cache frequent embeddings in Redis (via `CacheModule`) with a content-hash key. The same job description appearing across sources should never be embedded twice — this is especially important since the free tier has rate limits.
- **Respect the free tier rate limit** in `IngestionModule`'s queue. Process embedding jobs one at a time with a short delay rather than firing them concurrently. The queue in `IngestionModule` is critical for this reason.
- Log `embedding_model` and `embedding_dimensions` alongside vectors in the database. Model upgrades require re-embedding the full corpus, and you need to know which rows are stale.

```typescript
// embedding.service.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async embed(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  return result.embedding.values; // 768-dimensional vector
}

async embedBatch(texts: string[]): Promise<number[][]>
```

---

### 4. RagModule

**Responsibility:** The core RAG pipeline. Receive a user query, embed it, retrieve the top-k relevant job chunks from the vector store, build an augmented prompt, call the LLM, and return a structured response.

**Key files:**
- `rag.service.ts` — implements retrieve → augment → generate

**Good practices:**
- Keep the RAG pipeline as a **pure orchestration service** — no HTTP handling, no scheduling. It should only know about `EmbeddingService`, `VectorRepository`, and `LlmService`.
- **Control prompt size.** Count tokens in retrieved chunks before building the prompt. Set a hard ceiling (e.g. 4,000 tokens for context) and trim or rank chunks to fit.
- **Return source attribution.** Include `job_id`, `title`, and `company` alongside the LLM response so the client can link back to the original posting. Do not hallucinate citations.
- Implement a **retrieval quality threshold.** If the top-k similarity scores are all below a minimum cosine similarity (e.g. 0.75), respond with a "no relevant results" message rather than feeding low-quality context to the LLM.
- Use **`CacheModule`** to cache RAG responses for semantically identical or near-identical queries. A Redis key built from the embedding vector (rounded) works well for this.

```typescript
// rag.service.ts
async query(userQuery: string, filters?: QueryFilters): Promise<RagResponse>

interface RagResponse {
  answer: string;
  sources: JobSource[];
  retrievedAt: Date;
}
```

---

### 5. LlmModule

**Responsibility:** Wrap the Google Gemini API and expose a `complete(prompt: string): Promise<string>` method to `RagModule`.

**Provider:** `gemini-2.0-flash` — capable model available on Google AI's free tier (15 requests/minute, 1,500 requests/day). More than sufficient for a portfolio project with no real users, and genuinely good quality for job search Q&A.

**Key files:**
- `llm.service.ts` — configured Gemini client, completion method, retry logic

**Good practices:**
- Like `EmbeddingModule`, keep this **thin and swappable.** The model name and API key come from environment variables. Switching to GPT-4o or Claude is a one-line config change — make this explicit in your README as a deliberate architectural decision.
- Implement **streaming** support from the start (`completeStream`). Streaming dramatically improves perceived latency and is a strong talking point for recruiters.
- Add **retry logic with exponential backoff** for transient API errors. The free tier occasionally returns 503s under load.
- Log token usage per call. Even though the free tier costs nothing now, building the habit demonstrates production awareness.
- Store a `model_version` field on cached responses so stale cache entries are invalidated automatically when you upgrade the model.

```typescript
// llm.service.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async complete(prompt: string, options?: LlmOptions): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async completeStream(prompt: string): AsyncGenerator<string>
```

---

### 6. QueryModule

**Responsibility:** The HTTP API surface. Controllers, DTOs, validation pipes, and response shaping. Delegates all business logic to `RagService`.

**Key files:**
- `query.controller.ts` — REST or GraphQL endpoints
- `query.service.ts` — thin orchestration (validates input, calls `RagService`, shapes response)
- `dto/` — request/response DTOs with `class-validator` decorators

**Good practices:**
- Use **`ValidationPipe` globally** with `whitelist: true` and `forbidNonWhitelisted: true`. Never trust raw user input downstream.
- Support **query filters** at the API level (location, salary range, job type, date posted). Pass these to `RagService` as structured `QueryFilters`, which then narrows the vector search to pre-filtered candidates.
- Apply **rate limiting** at the controller level (`@nestjs/throttler`) — RAG queries trigger both embedding and LLM calls, which are expensive.
- Return **pagination metadata** even for RAG responses. Users may want to page through multiple retrieved job matches.
- Version your API from day one (`/api/v1/jobs/search`). The RAG response schema will evolve.

```typescript
// search-query.dto.ts
export class SearchQueryDto {
  @IsString()
  @MinLength(3)
  query: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsNumber()
  minSalary?: number;

  @IsOptional()
  @IsEnum(JobType)
  type?: JobType;
}
```

---

### 7. AuthModule

**Responsibility:** JWT authentication, guards, and role-based access control. Applied as a global guard to protect all routes.

**Good practices:**
- Mark as `@Global()` so you do not need to import it in every module.
- Use **refresh tokens** stored in Redis (via `CacheModule`) for stateless horizontal scaling.
- Apply role-based guards at the controller level: public search vs. admin ingestion triggers vs. user history endpoints are different roles.
- Never store sensitive credentials in JWTs. Keep the payload minimal (userId, role, expiry).

---

### 8. CacheModule

**Responsibility:** Redis-backed caching for embeddings, RAG responses, and auth tokens. Shared across the application.

**Good practices:**
- Mark as `@Global()` and use `@nestjs/cache-manager` with the Redis store.
- Use **namespaced keys** to avoid collisions: `embed:{contentHash}`, `rag:{queryHash}`, `auth:refresh:{userId}`.
- Set **appropriate TTLs per use case:**
  - Embeddings: 7 days (content rarely changes)
  - RAG responses: 1 hour (job market changes daily)
  - Auth refresh tokens: match token expiry
- Wrap cache access in try/catch. Cache failures should degrade gracefully, never crash the request.

---

## Module Dependency Graph

```
IngestionModule ──► StorageModule
IngestionModule ──► EmbeddingModule
                         │
QueryModule ──► RagModule ──► EmbeddingModule
                    │    └──► StorageModule
                    └──────► LlmModule

AuthModule (global) ──► all controllers
CacheModule (global) ──► EmbeddingModule, RagModule, AuthModule
```

---

## Additional Recommendations

### AI provider strategy

The entire AI layer runs on a single Google AI free tier key (`GEMINI_API_KEY`). Both `LlmModule` (`gemini-2.0-flash`) and `EmbeddingModule` (`text-embedding-004`) use the `@google/generative-ai` SDK. The free tier limits are 15 RPM and 1,500 requests/day — sufficient for a portfolio project with no real users, and the queue in `IngestionModule` ensures you never burst past them.

If you ever want to upgrade, the provider-agnostic module design means the change is isolated to `llm.service.ts` and `embedding.service.ts`. Document this explicitly in your README — it demonstrates production thinking.

### VPS resource awareness

This project shares a VPS with other applications. The target memory footprint for this service is under 1 GB: NestJS (~200 MB), PostgreSQL + pgvector (~300 MB), Redis (~100 MB). There is no local AI model running. Keep this constraint visible in your README and document the deliberate decision to use managed AI APIs over self-hosted models as a resource trade-off.


Use `@nestjs/config` with a validated config schema (`class-validator`) for all secrets and provider URLs. Never hardcode API keys. Keep a `.env.example` committed to the repo.

### Observability
Add structured logging (`nestjs-pino` or `winston`) from the start. Log ingestion counts, embedding durations, retrieval scores, LLM token usage, and cache hit/miss rates. These metrics will guide every optimization decision.

### Re-embedding strategy
When you upgrade your embedding model, you need to re-embed the entire corpus. Build a `reindex` admin endpoint in `IngestionModule` that iterates all stored jobs, re-embeds in batches, and replaces vectors. Store `embedding_model` and `embedding_version` on every vector record.

### Testing approach
- **Unit test** each service in isolation with mocked dependencies (especially `EmbeddingService` and `LlmService` — you do not want real API calls in CI).
- **Integration test** the full RAG pipeline with a seeded test database and a mocked LLM.
- **E2E test** the `QueryModule` endpoints with Supertest.

### Deployment considerations
- Run `IngestionModule` scheduler workers as a **separate process** from the API. This lets you scale the API horizontally without running duplicate schedulers.
- Use **`@nestjs/bull`** queues backed by Redis to hand work between the ingestion process and the embedding workers.
- The API (QueryModule + RagModule) is stateless and scales horizontally behind a load balancer. The ingestion process is a single leader (use a distributed lock in Redis to prevent duplicate runs).