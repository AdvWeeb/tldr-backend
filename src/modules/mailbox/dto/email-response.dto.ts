import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmailCategory, TaskStatus } from '../entities';

export class EmailSummaryDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  mailboxId: number;

  @ApiProperty({ example: '18abc123def456' })
  gmailMessageId: string;

  @ApiProperty({ example: '18abc123def456' })
  gmailThreadId: string;

  @ApiPropertyOptional({ example: 'Meeting tomorrow at 3pm' })
  subject: string | null;

  @ApiPropertyOptional({ example: 'Hi, just a reminder about our meeting...' })
  snippet: string | null;

  @ApiProperty({ example: 'sender@example.com' })
  fromEmail: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  fromName: string | null;

  @ApiProperty({ example: '2024-01-01T10:30:00.000Z' })
  receivedAt: Date;

  @ApiProperty({ example: false })
  isRead: boolean;

  @ApiProperty({ example: false })
  isStarred: boolean;

  @ApiProperty({ example: true })
  hasAttachments: boolean;

  @ApiPropertyOptional({ example: ['INBOX', 'IMPORTANT'] })
  labels: string[] | null;

  @ApiProperty({ enum: EmailCategory, example: EmailCategory.PRIMARY })
  category: EmailCategory;

  @ApiProperty({ enum: TaskStatus, example: TaskStatus.NONE })
  taskStatus: TaskStatus;

  @ApiProperty({ example: false })
  isPinned: boolean;

  @ApiProperty({ example: false })
  isSnoozed: boolean;

  @ApiPropertyOptional({ example: '2024-01-02T09:00:00.000Z' })
  snoozedUntil: Date | null;

  @ApiPropertyOptional({
    example:
      'This email discusses the upcoming project deadline and requests your feedback on the proposal.',
  })
  aiSummary: string | null;
}

export class AttachmentSummaryDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'document.pdf' })
  filename: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ example: 1024000 })
  size: number;

  @ApiProperty({ example: false })
  isInline: boolean;
}

export class EmailDetailDto extends EmailSummaryDto {
  @ApiPropertyOptional({ example: ['recipient@example.com'] })
  toEmails: string[] | null;

  @ApiPropertyOptional({ example: ['cc@example.com'] })
  ccEmails: string[] | null;

  @ApiPropertyOptional()
  bodyHtml: string | null;

  @ApiPropertyOptional()
  bodyText: string | null;

  @ApiPropertyOptional({ example: '2024-01-15T17:00:00.000Z' })
  taskDeadline: Date | null;

  @ApiPropertyOptional()
  aiActionItems: Record<string, unknown>[] | null;

  @ApiPropertyOptional({ example: 7 })
  aiUrgencyScore: number | null;

  @ApiProperty({ type: [AttachmentSummaryDto] })
  attachments: AttachmentSummaryDto[];
}

export class PaginationMetaDto {
  @ApiProperty({ example: 20 })
  itemsPerPage: number;

  @ApiProperty({ example: 150 })
  totalItems: number;

  @ApiProperty({ example: 1 })
  currentPage: number;

  @ApiProperty({ example: 8 })
  totalPages: number;
}

export class PaginationLinksDto {
  @ApiProperty({ example: '/v1/emails?page=1&limit=20' })
  first: string;

  @ApiProperty({ example: '/v1/emails?page=8&limit=20' })
  last: string;

  @ApiProperty({ example: '/v1/emails?page=1&limit=20' })
  current: string;

  @ApiPropertyOptional({ example: '/v1/emails?page=2&limit=20' })
  next: string | null;

  @ApiPropertyOptional({ example: null })
  previous: string | null;
}

export class PaginatedEmailsDto {
  @ApiProperty({ type: [EmailSummaryDto] })
  data: EmailSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;

  @ApiProperty({ type: PaginationLinksDto })
  links: PaginationLinksDto;
}
