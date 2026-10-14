export const VECTOR_STORE = Symbol('VECTOR_STORE');

export type VectorBackend = 'pgvector' | 'qdrant';

// Both backends are configured with the same HNSW parameters so the
// pgvector vs. Qdrant comparison isolates the engine, not the index settings.
export const HNSW_M = 16;
export const HNSW_EF_CONSTRUCTION = 128;
// pgvector's default hnsw.ef_search; Qdrant is queried with the same value.
export const DEFAULT_EF_SEARCH = 40;
export const VECTOR_SIZE = 768;

export interface JobChunkResult {
  id: string;
  jobId: string;
  chunkType: string;
  chunkText: string;
  embeddingModel: string;
  similarity: number;
}

export interface EmbeddedChunk {
  type: string;
  text: string;
  embedding: number[];
  model: string;
}

// Job attributes copied next to each vector so the store can filter on them.
export interface VectorJobMeta {
  id: string;
  source: string;
  jobType: string | null;
  isRemote: boolean;
  minSalary: number | null;
  maxSalary: number | null;
}

export interface VectorFilter {
  // job.minSalary >= minSalary
  minSalary?: number;
  // job.maxSalary <= maxSalary
  maxSalary?: number;
  // The job can pay at least this much: COALESCE(maxSalary, minSalary) >= X.
  // Used for queries such as "paying over 150k"; the benchmark keeps minSalary.
  salaryAtLeast?: number;
  jobType?: string;
  isRemote?: boolean;
}

export type SearchMode = 'auto' | 'ann' | 'exact';

export interface SearchOptions {
  topK: number;
  // Minimum cosine similarity; results below it are dropped.
  threshold?: number;
  filter?: VectorFilter;
  // auto: the engine decides (Postgres may prefer a sequential scan on small
  // tables); ann: force the HNSW index; exact: brute force, the ground truth
  // for ANN recall.
  mode?: SearchMode;
  efSearch?: number;
}

export interface VectorStore {
  readonly backend: VectorBackend;
  upsertChunks(job: VectorJobMeta, chunks: EmbeddedChunk[]): Promise<void>;
  search(
    queryVector: number[],
    options: SearchOptions,
  ): Promise<JobChunkResult[]>;
  findSimilar(
    queryVector: number[],
    topK: number,
    threshold: number,
  ): Promise<JobChunkResult[]>;
  findSimilarByJobIds(
    queryVector: number[],
    jobIds: string[],
  ): Promise<JobChunkResult[]>;
  hasEmbedding(jobId: string): Promise<boolean>;
  deleteByJobIds(jobIds: string[]): Promise<void>;
  clear(): Promise<void>;
}
