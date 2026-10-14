export interface RetrievedJob {
  jobId: string;
  score: number;
  // The reranker's relevance probability, for systems that rerank.
  rerankScore?: number;
}

// A system under evaluation: returns a ranked list of jobs for a query.
export interface RetrievalSystem {
  readonly name: string;
  retrieve(query: string, depth: number): Promise<RetrievedJob[]>;
}
