import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient, type Schemas } from '@qdrant/js-client-rest';
import { createHash } from 'crypto';
import { PgVectorStore } from './pgvector.store.js';
import {
  DEFAULT_EF_SEARCH,
  HNSW_EF_CONSTRUCTION,
  HNSW_M,
  VECTOR_SIZE,
  jobTypesOf,
  type EmbeddedChunk,
  type JobChunkResult,
  type SearchOptions,
  type VectorFilter,
  type VectorJobMeta,
  type VectorStore,
} from './vector-store.interface.js';

// Fixed namespace so a chunk id always maps to the same Qdrant point id.
const CHUNK_ID_NAMESPACE = '0d8f3b6e-5f0a-4c0e-9a57-3c2f1e7b9d41';
// A job has at most 6 chunks (identity, salary and 4 description windows).
const MAX_CHUNKS_PER_JOB = 6;

export interface ChunkPayload {
  chunkId: string;
  jobId: string;
  chunkType: string;
  chunkText: string;
  embeddingModel: string;
  source: string;
  jobType: string | null;
  isRemote: boolean;
  minSalary: number | null;
  maxSalary: number | null;
}

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: ChunkPayload;
}

// RFC 4122 name-based UUID (version 5, SHA-1). Qdrant point ids must be
// UUIDs or integers, while chunk ids are cuids.
export function uuidV5(name: string, namespace = CHUNK_ID_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1')
    .update(Buffer.concat([ns, Buffer.from(name, 'utf8')]))
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

@Injectable()
export class QdrantVectorStore implements VectorStore {
  readonly backend = 'qdrant' as const;
  private readonly logger = new Logger(QdrantVectorStore.name);
  private readonly client: QdrantClient;
  readonly collection: string;
  private ready: Promise<void> | null = null;

  constructor(
    private readonly pg: PgVectorStore,
    config: ConfigService,
  ) {
    this.client = new QdrantClient({
      url: config.get<string>('QDRANT_URL', 'http://localhost:6333'),
      apiKey: config.get<string>('QDRANT_API_KEY'),
      checkCompatibility: false,
    });
    this.collection = config.get<string>('QDRANT_COLLECTION', 'job_chunks');
  }

  // Postgres rows are written first (source of truth for chunk text), then
  // the job's points are replaced in Qdrant.
  async upsertChunks(
    job: VectorJobMeta,
    chunks: EmbeddedChunk[],
  ): Promise<void> {
    const chunkIds = await this.pg.writeRows(job.id, chunks);
    await this.deleteByJobIds([job.id]);
    await this.upsertPoints(
      chunks.map((chunk, i) => ({
        id: uuidV5(chunkIds[i]),
        vector: chunk.embedding,
        payload: {
          chunkId: chunkIds[i],
          jobId: job.id,
          chunkType: chunk.type,
          chunkText: chunk.text,
          embeddingModel: chunk.model,
          source: job.source,
          jobType: job.jobType,
          isRemote: job.isRemote,
          minSalary: job.minSalary,
          maxSalary: job.maxSalary,
        },
      })),
    );
  }

  async upsertPoints(points: QdrantPoint[]): Promise<void> {
    if (points.length === 0) return;
    await this.ensureCollection();
    await this.client.upsert(this.collection, {
      wait: true,
      points: points.map((p) => ({
        id: p.id,
        vector: p.vector,
        payload: { ...p.payload },
      })),
    });
  }

  async search(
    queryVector: number[],
    options: SearchOptions,
  ): Promise<JobChunkResult[]> {
    await this.ensureCollection();
    const response = await this.client.query(this.collection, {
      query: queryVector,
      limit: options.topK,
      score_threshold: options.threshold,
      filter: this.buildFilter(options.filter),
      params: {
        exact: options.mode === 'exact',
        hnsw_ef: options.efSearch ?? DEFAULT_EF_SEARCH,
      },
      with_payload: true,
    });
    return response.points.map((point) => {
      const payload = point.payload as unknown as ChunkPayload;
      return {
        id: payload.chunkId,
        jobId: payload.jobId,
        chunkType: payload.chunkType,
        chunkText: payload.chunkText,
        embeddingModel: payload.embeddingModel,
        similarity: point.score,
      };
    });
  }

  async findSimilar(
    queryVector: number[],
    topK: number,
    threshold: number,
  ): Promise<JobChunkResult[]> {
    return this.search(queryVector, { topK, threshold });
  }

  async findSimilarByJobIds(
    queryVector: number[],
    jobIds: string[],
  ): Promise<JobChunkResult[]> {
    if (jobIds.length === 0) return [];
    await this.ensureCollection();
    const response = await this.client.query(this.collection, {
      query: queryVector,
      limit: jobIds.length * MAX_CHUNKS_PER_JOB,
      filter: { must: [{ key: 'jobId', match: { any: jobIds } }] },
      params: { exact: true },
      with_payload: true,
    });
    return response.points.map((point) => {
      const payload = point.payload as unknown as ChunkPayload;
      return {
        id: payload.chunkId,
        jobId: payload.jobId,
        chunkType: payload.chunkType,
        chunkText: payload.chunkText,
        embeddingModel: payload.embeddingModel,
        similarity: point.score,
      };
    });
  }

  // Checked against Qdrant rather than Postgres so a job whose Qdrant write
  // failed is re-embedded on the next ingestion run.
  async hasEmbedding(jobId: string): Promise<boolean> {
    await this.ensureCollection();
    const { count } = await this.client.count(this.collection, {
      filter: { must: [{ key: 'jobId', match: { value: jobId } }] },
      exact: true,
    });
    return count > 0;
  }

  async deleteByJobIds(jobIds: string[]): Promise<void> {
    if (jobIds.length === 0) return;
    await this.ensureCollection();
    await this.client.delete(this.collection, {
      wait: true,
      filter: { must: [{ key: 'jobId', match: { any: jobIds } }] },
    });
  }

  async clear(): Promise<void> {
    await this.recreateCollection();
  }

  async recreateCollection(): Promise<void> {
    const { exists } = await this.client.collectionExists(this.collection);
    if (exists) await this.client.deleteCollection(this.collection);
    this.ready = null;
    await this.ensureCollection();
  }

  async info(): Promise<Schemas['CollectionInfo']> {
    await this.ensureCollection();
    return this.client.getCollection(this.collection);
  }

  // Created lazily so the app can start with VECTOR_BACKEND=pgvector and no
  // Qdrant server running.
  private ensureCollection(): Promise<void> {
    this.ready ??= this.createCollectionIfMissing().catch((err: Error) => {
      this.ready = null;
      throw err;
    });
    return this.ready;
  }

  private async createCollectionIfMissing(): Promise<void> {
    const { exists } = await this.client.collectionExists(this.collection);
    if (exists) return;

    this.logger.log(`Creating Qdrant collection ${this.collection}`);
    await this.client.createCollection(this.collection, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
      hnsw_config: { m: HNSW_M, ef_construct: HNSW_EF_CONSTRUCTION },
      // Qdrant only builds HNSW for segments above indexing_threshold (KB).
      // The default (~3k vectors per segment) would leave a corpus of a few
      // thousand chunks brute-forced, which would skew the comparison.
      optimizers_config: { default_segment_number: 2, indexing_threshold: 10 },
    });

    const indexes: Array<[string, 'keyword' | 'bool' | 'integer']> = [
      ['jobId', 'keyword'],
      ['chunkType', 'keyword'],
      ['source', 'keyword'],
      ['jobType', 'keyword'],
      ['isRemote', 'bool'],
      ['minSalary', 'integer'],
      ['maxSalary', 'integer'],
    ];
    for (const [field_name, field_schema] of indexes) {
      await this.client.createPayloadIndex(this.collection, {
        field_name,
        field_schema,
        wait: true,
      });
    }
  }

  private buildFilter(filter?: VectorFilter): Schemas['Filter'] | undefined {
    if (!filter) return undefined;
    const must: Schemas['Condition'][] = [];
    if (filter.minSalary !== undefined) {
      must.push({ key: 'minSalary', range: { gte: filter.minSalary } });
    }
    if (filter.maxSalary !== undefined) {
      must.push({ key: 'maxSalary', range: { lte: filter.maxSalary } });
    }
    if (filter.salaryAtLeast !== undefined) {
      // COALESCE(maxSalary, minSalary) >= X
      const atLeast = { gte: filter.salaryAtLeast };
      must.push({
        should: [
          { key: 'maxSalary', range: atLeast },
          {
            must: [
              { is_empty: { key: 'maxSalary' } },
              { key: 'minSalary', range: atLeast },
            ],
          },
        ],
      });
    }
    const jobTypes = jobTypesOf(filter);
    if (jobTypes?.length === 1) {
      must.push({ key: 'jobType', match: { value: jobTypes[0] } });
    } else if (jobTypes) {
      must.push({ key: 'jobType', match: { any: jobTypes } });
    }
    if (filter.isRemote !== undefined) {
      must.push({ key: 'isRemote', match: { value: filter.isRemote } });
    }
    return must.length > 0 ? { must } : undefined;
  }
}
