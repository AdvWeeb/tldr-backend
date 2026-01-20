import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SendEmailDto {
  @ApiProperty({
    description: 'Mailbox ID to send from',
    example: 1,
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return parseInt(value, 10);
    }
    return value;
  })
  @IsNotEmpty()
  mailboxId: number;

  @ApiProperty({
    description: 'Recipient email addresses',
    example: ['user@example.com'],
    type: [String],
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'At least one recipient is required' })
  @ArrayMaxSize(500, { message: 'Cannot exceed 500 recipients' })
  @IsEmail(
    {},
    { each: true, message: 'Each recipient must be a valid email address' },
  )
  to: string[];

  @ApiProperty({
    description: 'CC recipients',
    example: ['cc@example.com'],
    type: [String],
    required: false,
  })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500, { message: 'Cannot exceed 500 CC recipients' })
  @IsEmail(
    {},
    { each: true, message: 'Each CC recipient must be a valid email address' },
  )
  cc?: string[];

  @ApiProperty({
    description: 'BCC recipients',
    example: ['bcc@example.com'],
    type: [String],
    required: false,
  })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500, { message: 'Cannot exceed 500 BCC recipients' })
  @IsEmail(
    {},
    { each: true, message: 'Each BCC recipient must be a valid email address' },
  )
  bcc?: string[];

  @ApiProperty({
    description: 'Email subject',
    example: 'Hello World',
  })
  @IsString()
  @IsNotEmpty({ message: 'Subject is required' })
  @MaxLength(998, { message: 'Subject cannot exceed 998 characters' })
  subject: string;

  @ApiProperty({
    description: 'Email body in plain text',
    example: 'This is the email body',
  })
  @IsString()
  @IsNotEmpty({ message: 'Email body is required' })
  @MinLength(1, { message: 'Email body cannot be empty' })
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
