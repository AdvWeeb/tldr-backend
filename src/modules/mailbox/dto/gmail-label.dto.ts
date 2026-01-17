import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GmailLabelDto {
  @ApiProperty({
    description: 'Gmail label ID',
    example: 'INBOX',
  })
  id: string;

  @ApiProperty({
    description: 'Display name of the label',
    example: 'Inbox',
  })
  name: string;

  @ApiProperty({
    description: 'Label type',
    enum: ['system', 'user'],
    example: 'system',
  })
  type: 'system' | 'user';

  @ApiPropertyOptional({
    description: 'Number of messages with this label',
    example: 42,
  })
  messagesTotal?: number;

  @ApiPropertyOptional({
    description: 'Number of unread messages with this label',
    example: 5,
  })
  messagesUnread?: number;

  @ApiPropertyOptional({
    description: 'Label background color',
    example: '#16a765',
  })
  backgroundColor?: string;

  @ApiPropertyOptional({
    description: 'Label text color',
    example: '#ffffff',
  })
  textColor?: string;
}

export class GmailLabelsResponseDto {
  @ApiProperty({
    description: 'System labels (INBOX, SENT, etc.)',
    type: [GmailLabelDto],
  })
  system: GmailLabelDto[];

  @ApiProperty({
    description: 'User-created labels',
    type: [GmailLabelDto],
  })
  user: GmailLabelDto[];
}
