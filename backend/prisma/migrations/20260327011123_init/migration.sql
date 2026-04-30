-- Enable pgvector extension (required for vector columns)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "jobType" TEXT,
    "salary" TEXT,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobChunk" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "chunkText" TEXT NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "embeddingVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_source_contentHash_idx" ON "Job"("source", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "Job_source_sourceId_key" ON "Job"("source", "sourceId");

-- CreateIndex
CREATE INDEX "JobChunk_jobId_idx" ON "JobChunk"("jobId");

-- AddForeignKey
ALTER TABLE "JobChunk" ADD CONSTRAINT "JobChunk_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
