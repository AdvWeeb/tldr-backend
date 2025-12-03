import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class SendEmailDto {
  @ApiProperty({
    description: 'Mailbox ID to send from',
    example: 1,
  })
  @IsNotEmpty()
  mailboxId: number;

  @ApiProperty({
    description: 'Recipient email addresses',
    example: ['user@example.com'],
    type: [String],
  })
  @IsArray()
  @IsEmail({}, { each: true })
  @IsNotEmpty()
  to: string[];

  @ApiProperty({
    description: 'CC recipients',
    example: ['cc@example.com'],
    type: [String],
    required: false,
  })
  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  cc?: string[];

  @ApiProperty({
    description: 'BCC recipients',
    example: ['bcc@example.com'],
    type: [String],
    required: false,
  })
  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  bcc?: string[];

  @ApiProperty({
    description: 'Email subject',
    example: 'Hello World',
  })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({
    description: 'Email body in plain text',
    example: 'This is the email body',
  })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({
    description: 'Email body in HTML format',
    example: '<p>This is the email body</p>',
    required: false,
  })
  @IsString()
  @IsOptional()
  bodyHtml?: string;

  @ApiProperty({
    description: 'Gmail message ID to reply to (for threading)',
    required: false,
  })
  @IsString()
  @IsOptional()
  inReplyTo?: string;

  @ApiProperty({
    description: 'Gmail thread ID (for threading)',
    required: false,
  })
  @IsString()
  @IsOptional()
  threadId?: string;
}
