-- AlterTable: add Job columns that exist in schema.prisma but were never migrated
ALTER TABLE "Job"
  ADD COLUMN IF NOT EXISTS "summary"          TEXT,
  ADD COLUMN IF NOT EXISTS "salary"           TEXT,
  ADD COLUMN IF NOT EXISTS "logo"             TEXT,
  ADD COLUMN IF NOT EXISTS "responsibilities" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "requirements"     TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "benefits"         TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "skills"           TEXT[] NOT NULL DEFAULT '{}';

-- Add vector embedding column to JobChunk (previously applied as raw SQL outside Prisma)
ALTER TABLE "JobChunk" ADD COLUMN IF NOT EXISTS embedding vector(768);
CREATE INDEX IF NOT EXISTS "JobChunk_embedding_idx" ON "JobChunk" USING ivfflat (embedding vector_cosine_ops);
