import { ApiProperty } from '@nestjs/swagger';
import { EmailSummaryDto } from './email-response.dto';

export class SemanticSearchResultDto extends EmailSummaryDto {
  @ApiProperty({
    description: 'Cosine similarity score (0.0 - 1.0)',
    example: 0.85,
  })
  similarity: number;
}

export class SemanticSearchResponseDto {
  @ApiProperty({
    description: 'Array of semantically similar emails',
    type: [SemanticSearchResultDto],
  })
  data: SemanticSearchResultDto[];

  @ApiProperty({
    description: 'Search metadata',
  })
  meta: {
    query: string;
    minSimilarity: number;
    totalResults: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
