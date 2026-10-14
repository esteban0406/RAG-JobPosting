import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RERANK_TIMEOUT_MS = 15_000;

export interface RerankScores {
  // Relevance probability per document, in input order.
  scores: number[];
  model: string;
}

// Cross-encoder reranking served by the local embedding server (/rerank).
@Injectable()
export class RerankService {
  private readonly url: string;

  constructor(config: ConfigService) {
    this.url =
      config.get<string>('RERANKER_URL') ??
      config.get<string>('LOCAL_EMBEDDING_URL', 'http://localhost:8000');
  }

  async score(query: string, documents: string[]): Promise<RerankScores> {
    if (documents.length === 0) return { scores: [], model: '' };
    const response = await fetch(`${this.url}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, documents }),
      signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Reranker returned ${response.status}`,
      );
    }
    const data = (await response.json()) as Partial<RerankScores>;
    if (
      !Array.isArray(data.scores) ||
      data.scores.length !== documents.length
    ) {
      throw new Error(
        `Reranker returned ${data.scores?.length} scores for ${documents.length} documents`,
      );
    }
    return { scores: data.scores, model: data.model ?? 'unknown' };
  }
}
