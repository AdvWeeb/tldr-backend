import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateColumnDto {
  @ApiProperty({
    description: 'Title of the Kanban column',
    example: 'Urgent',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiPropertyOptional({
    description: 'Position of the column (0-based)',
    example: 0,
    minimum: 0,
  })
  @IsInt()
  @IsOptional()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional({
    description:
      'Gmail Label ID to associate with this column (e.g., STARRED, IMPORTANT, or custom label)',
    example: 'STARRED',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  gmailLabelId?: string;

  @ApiPropertyOptional({
    description: 'Color for the column in hex format',
    example: '#3B82F6',
    maxLength: 20,
  })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  color?: string;
}

export class UpdateColumnDto {
  @ApiPropertyOptional({
    description: 'Title of the Kanban column',
    example: 'Follow-up',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({
    description: 'Position of the column (0-based)',
    example: 1,
    minimum: 0,
  })
  @IsInt()
  @IsOptional()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional({
    description: 'Gmail Label ID to associate with this column',
    example: 'IMPORTANT',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  gmailLabelId?: string;

  @ApiPropertyOptional({
    description: 'Color for the column in hex format',
    example: '#EF4444',
    maxLength: 20,
  })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  color?: string;
}

export class ColumnDto {
  @ApiProperty({ description: 'Column ID' })
  id: number;

  @ApiProperty({ description: 'Column title' })
  title: string;

  @ApiProperty({ description: 'Column position' })
  orderIndex: number;

  @ApiProperty({ description: 'Associated Gmail Label ID', nullable: true })
  gmailLabelId: string | null;

  @ApiProperty({ description: 'Column color' })
  color: string;

  @ApiProperty({ description: 'Whether this is a default column' })
  isDefault: boolean;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;
}

export class MoveEmailToColumnDto {
  @ApiProperty({
    description: 'Target column ID',
    example: 1,
  })
  @IsInt()
  @Min(1)
  columnId: number;

  @ApiPropertyOptional({
    description: 'Whether to remove INBOX label (archive)',
    example: true,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  archiveFromInbox?: boolean;
}
