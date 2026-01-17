import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EmailCategory, TaskStatus } from '../entities';

export class EmailQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by mailbox ID' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  mailboxId?: number;

  @ApiPropertyOptional({ description: 'Search in subject and snippet' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by read status' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  isRead?: boolean;

  @ApiPropertyOptional({ description: 'Filter by starred status' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  isStarred?: boolean;

  @ApiPropertyOptional({ description: 'Filter by attachments' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  hasAttachments?: boolean;

  @ApiPropertyOptional({ enum: EmailCategory })
  @IsEnum(EmailCategory)
  @IsOptional()
  category?: EmailCategory;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsEnum(TaskStatus)
  @IsOptional()
  taskStatus?: TaskStatus;

  @ApiPropertyOptional({ description: 'Filter by sender email' })
  @IsString()
  @IsOptional()
  fromEmail?: string;

  @ApiPropertyOptional({ description: 'Filter by Gmail label' })
  @IsString()
  @IsOptional()
  label?: string;

  @ApiPropertyOptional({ description: 'Exclude emails with this label (for Archive)' })
  @IsString()
  @IsOptional()
  excludeLabel?: string;

  @ApiPropertyOptional({ description: 'Filter by snoozed status' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  isSnoozed?: boolean;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['receivedAt', 'subject', 'fromEmail'],
    default: 'receivedAt',
  })
  @IsString()
  @IsOptional()
  sortBy?: 'receivedAt' | 'subject' | 'fromEmail' = 'receivedAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
  })
  @IsEnum(['ASC', 'DESC'] as const)
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
