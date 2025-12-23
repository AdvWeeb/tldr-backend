import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SemanticSearchDto {
  @ApiProperty({
    description: 'Search query (conceptual search)',
    example: 'money and invoices',
  })
  @IsString()
  q: string;

  @ApiPropertyOptional({
    description: 'Minimum cosine similarity (0.0 - 1.0)',
    example: 0.5,
    minimum: 0,
    maximum: 1,
    default: 0.5,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  minSimilarity?: number = 0.5;

  @ApiPropertyOptional({
    description: 'Mailbox ID to filter results',
    example: 1,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  mailboxId?: number;

  @ApiPropertyOptional({
    description: 'Page number',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
