import type { JobSource } from '../../rag/dto/rag-response.dto.js';
import type { TemplateKey } from '../aggregation/query-templates.js';

export class SearchResponseDto {
  type: 'retrieval' | 'aggregation' | 'hybrid';
  answer: string;
  sources?: JobSource[];
  aggregation?: {
    intent: TemplateKey;
    rows: Record<string, unknown>[];
  };
  retrievedAt: Date;
}
