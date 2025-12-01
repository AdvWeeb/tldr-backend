import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsOptional } from 'class-validator';
import { TaskStatus } from '../entities';

export class UpdateEmailDto {
  @ApiPropertyOptional({ description: 'Mark as read/unread' })
  @IsBoolean()
  @IsOptional()
  isRead?: boolean;

  @ApiPropertyOptional({ description: 'Star/unstar the email' })
  @IsBoolean()
  @IsOptional()
  isStarred?: boolean;

  @ApiPropertyOptional({ description: 'Pin/unpin the email' })
  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsEnum(TaskStatus)
  @IsOptional()
  taskStatus?: TaskStatus;

  @ApiPropertyOptional({ description: 'Task deadline' })
  @IsDateString()
  @IsOptional()
  taskDeadline?: string;

  @ApiPropertyOptional({ description: 'Snooze until timestamp' })
  @IsDateString()
  @IsOptional()
  snoozedUntil?: string;
}
