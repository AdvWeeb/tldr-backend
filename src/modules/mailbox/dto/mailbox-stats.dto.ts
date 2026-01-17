import { ApiProperty } from '@nestjs/swagger';

export class StatItem {
  @ApiProperty({ example: 10 })
  total: number;

  @ApiProperty({ example: 5 })
  unread: number;
}

export class MailboxStatsDto {
  @ApiProperty()
  inbox: StatItem;

  @ApiProperty()
  starred: StatItem;

  @ApiProperty()
  drafts: StatItem;

  @ApiProperty()
  sent: StatItem;

  @ApiProperty()
  spam: StatItem;

  @ApiProperty()
  trash: StatItem;
}

