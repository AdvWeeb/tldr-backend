import { ApiProperty } from '@nestjs/swagger';
import { MailboxProvider, MailboxSyncStatus } from '../entities';

export class MailboxResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'user@gmail.com' })
  email: string;

  @ApiProperty({ enum: MailboxProvider, example: MailboxProvider.GMAIL })
  provider: MailboxProvider;

  @ApiProperty({ enum: MailboxSyncStatus, example: MailboxSyncStatus.SYNCED })
  syncStatus: MailboxSyncStatus;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', nullable: true })
  lastSyncAt: Date | null;

  @ApiProperty({ example: 1500 })
  totalEmails: number;

  @ApiProperty({ example: 25 })
  unreadCount: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;
}

export class MailboxListResponseDto {
  @ApiProperty({ type: [MailboxResponseDto] })
  mailboxes: MailboxResponseDto[];
}
