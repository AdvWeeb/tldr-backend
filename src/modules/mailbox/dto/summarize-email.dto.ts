import { ApiProperty } from '@nestjs/swagger';

export class SummarizeEmailResponseDto {
  @ApiProperty({
    description: 'AI-generated summary of the email content',
    example:
      'This email is a meeting invitation for tomorrow at 3pm to discuss Q1 project updates. Please confirm attendance and review the attached agenda beforehand.',
  })
  summary: string;

  @ApiProperty({
    description: 'ID of the email that was summarized',
    example: 123,
  })
  emailId: number;

  @ApiProperty({
    description: 'Whether the summary was saved to the database',
    example: true,
  })
  saved: boolean;
}
