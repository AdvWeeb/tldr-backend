import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import encryptionConfig from '../../config/encryption.config';
import googleOAuthConfig from '../../config/google-oauth.config';
import { AttachmentController } from './attachment.controller';
import { AttachmentService } from './attachment.service';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { Attachment, Email, Mailbox } from './entities';
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
    TypeOrmModule.forFeature([Mailbox, Email, Attachment]),
  ],
  controllers: [MailboxController, EmailController, AttachmentController],
  providers: [
    MailboxService,
    EmailService,
    AttachmentService,
    GmailService,
    EmailSyncService,
    SnoozeWakeupService,
    AiService,
  ],
  exports: [MailboxService, EmailService, AttachmentService],
})
export class MailboxModule {}
