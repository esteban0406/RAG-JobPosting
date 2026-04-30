-- Add vector embedding column to JobChunk (previously applied as raw SQL outside Prisma)
ALTER TABLE "JobChunk" ADD COLUMN IF NOT EXISTS embedding vector(768);
CREATE INDEX IF NOT EXISTS "JobChunk_embedding_idx" ON "JobChunk" USING ivfflat (embedding vector_cosine_ops);
