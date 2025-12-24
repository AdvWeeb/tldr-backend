import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import encryptionConfig from '../../config/encryption.config';
import googleOAuthConfig from '../../config/google-oauth.config';
import { AttachmentController } from './attachment.controller';
import { AttachmentService } from './attachment.service';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { Attachment, ColumnConfig, Email, Mailbox } from './entities';
import { KanbanController } from './kanban.controller';
import { KanbanService } from './kanban.service';
import { MailboxController } from './mailbox.controller';
import { MailboxService } from './mailbox.service';
import { AiService } from './providers/ai.service';
import { EmailSyncService } from './providers/email-sync.service';
import { GmailService } from './providers/gmail.service';
import { SnoozeWakeupService } from './providers/snooze-wakeup.service';

@Module({
  imports: [
    ConfigModule.forFeature(googleOAuthConfig),
    ConfigModule.forFeature(encryptionConfig),
    TypeOrmModule.forFeature([Mailbox, Email, Attachment, ColumnConfig]),
  ],
  controllers: [
    MailboxController,
    EmailController,
    AttachmentController,
    KanbanController,
  ],
  providers: [
    MailboxService,
    EmailService,
    AttachmentService,
    KanbanService,
    GmailService,
    EmailSyncService,
    SnoozeWakeupService,
    AiService,
  ],
  exports: [MailboxService, EmailService, AttachmentService, KanbanService],
})
export class MailboxModule {}
