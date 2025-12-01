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
import { User } from '../../user/entities/user.entity';

export enum MailboxProvider {
  GMAIL = 'gmail',
}

export enum MailboxSyncStatus {
  PENDING = 'pending',
  SYNCING = 'syncing',
  SYNCED = 'synced',
  ERROR = 'error',
}

@Entity('mailboxes')
export class Mailbox {
  @ApiProperty({
    description: 'Mailbox unique identifier',
    example: 1,
  })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({
    description: 'User ID who owns this mailbox',
    example: 1,
  })
  @Column()
  @Index()
  userId: number;

  @ApiProperty({
    description: 'Email address of the mailbox',
    example: 'user@gmail.com',
  })
  @Column()
  @Index()
  email: string;

  @ApiProperty({
    description: 'Email provider',
    example: MailboxProvider.GMAIL,
    enum: MailboxProvider,
  })
  @Column({
    type: 'enum',
    enum: MailboxProvider,
    default: MailboxProvider.GMAIL,
  })
  provider: MailboxProvider;

  @Column({ type: 'text', nullable: true })
  encryptedAccessToken: string | null;

  @Column({ type: 'text', nullable: true })
  encryptedRefreshToken: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  tokenExpiresAt: Date | null;

  @ApiProperty({
    description: 'Synchronization status',
    example: MailboxSyncStatus.SYNCED,
    enum: MailboxSyncStatus,
  })
  @Column({
    type: 'enum',
    enum: MailboxSyncStatus,
    default: MailboxSyncStatus.PENDING,
  })
  syncStatus: MailboxSyncStatus;

  @ApiProperty({
    description: 'Last successful sync timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  @Column({ type: 'timestamp with time zone', nullable: true })
  lastSyncAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastSyncError: string | null;

  @Column({ type: 'text', nullable: true })
  historyId: string | null;

  @ApiProperty({
    description: 'Total number of emails in mailbox',
    example: 1500,
  })
  @Column({ default: 0 })
  totalEmails: number;

  @ApiProperty({
    description: 'Number of unread emails',
    example: 25,
  })
  @Column({ default: 0 })
  unreadCount: number;

  @ApiProperty({
    description: 'Whether the mailbox is active',
    example: true,
  })
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp with time zone' })
  deletedAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany('Email', 'mailbox')
  emails: import('./email.entity').Email[];
}
