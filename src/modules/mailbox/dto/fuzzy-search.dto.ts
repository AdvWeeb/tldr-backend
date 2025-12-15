import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum FuzzySearchField {
  SUBJECT = 'subject',
  SENDER = 'sender',
  BODY = 'body',
  ALL = 'all',
}

export class FuzzySearchDto {
  @ApiPropertyOptional({
    description: 'Search query (supports typos and partial matches)',
    example: 'markting',
  })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({
    description:
      'Minimum similarity threshold (0.0 - 1.0). Lower = more results, higher = stricter matching',
    example: 0.2,
    minimum: 0,
    maximum: 1,
    default: 0.2,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  threshold?: number = 0.2;

  @ApiPropertyOptional({
    description: 'Which fields to search in',
    enum: FuzzySearchField,
    default: FuzzySearchField.ALL,
  })
  @IsEnum(FuzzySearchField)
  @IsOptional()
  fields?: FuzzySearchField = FuzzySearchField.ALL;

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

  @ApiPropertyOptional({
    description: 'Weight for subject field (0.0 - 1.0)',
    example: 0.4,
    default: 0.4,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  subjectWeight?: number = 0.4;

  @ApiPropertyOptional({
    description: 'Weight for sender field (0.0 - 1.0)',
    example: 0.3,
    default: 0.3,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  senderWeight?: number = 0.3;

  @ApiPropertyOptional({
    description: 'Weight for body/summary field (0.0 - 1.0)',
    example: 0.3,
    default: 0.3,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  bodyWeight?: number = 0.3;
}
