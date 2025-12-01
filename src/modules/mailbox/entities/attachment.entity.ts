import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Email } from './email.entity';

@Entity('attachments')
export class Attachment {
  @ApiProperty({
    description: 'Attachment unique identifier',
    example: 1,
  })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({
    description: 'Email ID this attachment belongs to',
    example: 1,
  })
  @Column()
  @Index()
  emailId: number;

  @ApiProperty({
    description: 'Gmail attachment ID',
    example: 'ANGjdJ_abc123',
  })
  @Column({ type: 'text' })
  gmailAttachmentId: string;

  @ApiProperty({
    description: 'Original filename',
    example: 'document.pdf',
  })
  @Column({ type: 'text' })
  filename: string;

  @ApiProperty({
    description: 'MIME type',
    example: 'application/pdf',
  })
  @Column({ type: 'text' })
  mimeType: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1024000,
  })
  @Column({ type: 'bigint' })
  size: number;

  @ApiProperty({
    description: 'Content ID for inline attachments',
    example: 'image001@example.com',
  })
  @Column({ type: 'text', nullable: true })
  contentId: string | null;

  @ApiProperty({
    description: 'Whether this is an inline attachment',
    example: false,
  })
  @Column({ default: false })
  isInline: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ManyToOne(() => Email, (email) => email.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'emailId' })
  email: Email;
}
