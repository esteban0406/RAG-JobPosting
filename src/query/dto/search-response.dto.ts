import type { JobSource, RagResponse } from '../../rag/dto/rag-response.dto.js';

export class SearchResponseDto implements RagResponse {
  answer: string;
  sources: JobSource[];
  retrievedAt: Date;
}
