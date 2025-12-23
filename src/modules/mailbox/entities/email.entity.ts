import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Mailbox } from './mailbox.entity';

export enum EmailCategory {
  PRIMARY = 'primary',
  SOCIAL = 'social',
  PROMOTIONS = 'promotions',
  UPDATES = 'updates',
  FORUMS = 'forums',
}

export enum TaskStatus {
  NONE = 'none',
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}

@Entity('emails')
@Index(['mailboxId', 'gmailMessageId'], { unique: true })
@Index(['mailboxId', 'receivedAt'])
@Index(['mailboxId', 'isRead'])
@Index(['mailboxId', 'category'])
@Index(['isSnoozed', 'snoozedUntil'])
export class Email {
  @ApiProperty({
    description: 'Email unique identifier',
    example: 1,
  })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({
    description: 'Mailbox ID this email belongs to',
    example: 1,
  })
  @Column()
  @Index()
  mailboxId: number;

  @ApiProperty({
    description: 'Gmail message ID',
    example: '18abc123def456',
  })
  @Column({ type: 'text' })
  gmailMessageId: string;

  @ApiProperty({
    description: 'Gmail thread ID',
    example: '18abc123def456',
  })
  @Column({ type: 'text' })
  @Index()
  gmailThreadId: string;

  @ApiProperty({
    description: 'Email subject',
    example: 'Meeting tomorrow at 3pm',
  })
  @Column({ type: 'text', nullable: true })
  subject: string | null;

  @ApiProperty({
    description: 'Email snippet (preview text)',
    example: 'Hi, just a reminder about our meeting...',
  })
  @Column({ type: 'text', nullable: true })
  snippet: string | null;

  @ApiProperty({
    description: 'Sender email address',
    example: 'sender@example.com',
  })
  @Column({ type: 'text' })
  @Index()
  fromEmail: string;

  @ApiProperty({
    description: 'Sender display name',
    example: 'John Doe',
  })
  @Column({ type: 'text', nullable: true })
  fromName: string | null;

  @ApiProperty({
    description: 'Recipient email addresses',
    example: ['recipient@example.com'],
  })
  @Column({ type: 'simple-array', nullable: true })
  toEmails: string[] | null;

  @ApiProperty({
    description: 'CC email addresses',
    example: ['cc@example.com'],
  })
  @Column({ type: 'simple-array', nullable: true })
  ccEmails: string[] | null;

  @ApiProperty({
    description: 'BCC email addresses',
    example: ['bcc@example.com'],
  })
  @Column({ type: 'simple-array', nullable: true })
  bccEmails: string[] | null;

  @Column({ type: 'text', nullable: true })
  bodyHtml: string | null;

  @Column({ type: 'text', nullable: true })
  bodyText: string | null;

  @ApiProperty({
    description: 'When the email was received',
    example: '2024-01-01T10:30:00.000Z',
  })
  @Column({ type: 'timestamp with time zone' })
  receivedAt: Date;

  @ApiProperty({
    description: 'Whether the email has been read',
    example: false,
  })
  @Column({ default: false })
  isRead: boolean;

  @ApiProperty({
    description: 'Whether the email is starred',
    example: false,
  })
  @Column({ default: false })
  isStarred: boolean;

  @ApiProperty({
    description: 'Whether the email has attachments',
    example: true,
  })
  @Column({ default: false })
  hasAttachments: boolean;

  @ApiProperty({
    description: 'Gmail labels',
    example: ['INBOX', 'IMPORTANT'],
  })
  @Column({ type: 'simple-array', nullable: true })
  labels: string[] | null;

  @ApiProperty({
    description: 'Email category',
    example: EmailCategory.PRIMARY,
    enum: EmailCategory,
  })
  @Column({
    type: 'enum',
    enum: EmailCategory,
    default: EmailCategory.PRIMARY,
  })
  category: EmailCategory;

  @ApiProperty({
    description: 'Task status for Email-as-Task feature',
    example: TaskStatus.TODO,
    enum: TaskStatus,
  })
  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.NONE,
  })
  taskStatus: TaskStatus;

  @ApiProperty({
    description: 'Task deadline',
    example: '2024-01-15T17:00:00.000Z',
  })
  @Column({ type: 'timestamp with time zone', nullable: true })
  taskDeadline: Date | null;

  @ApiProperty({
    description: 'Whether the email is pinned',
    example: false,
  })
  @Column({ default: false })
  isPinned: boolean;

  @ApiProperty({
    description: 'Whether the email is currently snoozed',
    example: false,
  })
  @Column({ default: false })
  isSnoozed: boolean;

  @ApiProperty({
    description: 'Snooze until timestamp (wake up time)',
    example: '2024-01-02T09:00:00.000Z',
  })
  @Column({ type: 'timestamp with time zone', nullable: true })
  snoozedUntil: Date | null;

  @Column({ type: 'text', nullable: true })
  aiSummary: string | null;

  @Column({ type: 'jsonb', nullable: true })
  aiActionItems: Record<string, unknown>[] | null;

  @Column({ type: 'smallint', nullable: true })
  aiUrgencyScore: number | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp with time zone' })
  deletedAt: Date | null;

  @ManyToOne(() => Mailbox, (mailbox) => mailbox.emails, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'mailboxId' })
  mailbox: Mailbox;

  @OneToMany('Attachment', 'email')
  attachments: import('./attachment.entity').Attachment[];

  embedding?: number[] | Buffer | null;

  @Column({ type: 'timestamp', nullable: true })
  embeddingGeneratedAt: Date | null;
}
