import type { JobSource } from '../../rag/dto/rag-response.dto.js';

export class SearchResponseDto {
  type: 'retrieval' | 'aggregation' | 'hybrid';
  answer: string;
  sources?: JobSource[];
  retrievedAt: Date;
}
