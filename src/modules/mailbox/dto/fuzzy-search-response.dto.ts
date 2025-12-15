import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmailSummaryDto } from './email-response.dto';

export class FuzzySearchMatchDto {
  @ApiProperty({
    description: 'Subject similarity score (0.0 - 1.0)',
    example: 0.92,
  })
  subject: number;

  @ApiProperty({
    description: 'Sender similarity score (0.0 - 1.0)',
    example: 0.65,
  })
  sender: number;

  @ApiPropertyOptional({
    description: 'Body/summary relevance score (0.0 - 1.0)',
    example: 0.71,
  })
  body?: number;
}

export class FuzzySearchResultDto extends EmailSummaryDto {
  @ApiProperty({
    description: 'Combined relevance score (0.0 - 1.0)',
    example: 0.85,
  })
  relevance: number;

  @ApiProperty({
    description: 'Individual field match scores',
    type: FuzzySearchMatchDto,
  })
  matches: FuzzySearchMatchDto;
}

export class FuzzySearchResponseDto {
  @ApiProperty({
    description: 'Array of matching emails with relevance scores',
    type: [FuzzySearchResultDto],
  })
  data: FuzzySearchResultDto[];

  @ApiProperty({
    description: 'Search metadata',
  })
  meta: {
    query: string;
    threshold: number;
    totalResults: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
