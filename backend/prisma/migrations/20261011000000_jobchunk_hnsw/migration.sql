-- Replace the IVFFlat index with HNSW.
-- The IVFFlat index was created on an empty table (default lists, probes = 1)
-- and the similarity query ordered by a derived expression, so the planner
-- never used it. HNSW uses the same parameters as the Qdrant collection
-- (m = 16, ef_construction = 128) so both engines are compared on equal terms.
DROP INDEX IF EXISTS "JobChunk_embedding_idx";

CREATE INDEX "JobChunk_embedding_hnsw_idx"
  ON "JobChunk" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);
