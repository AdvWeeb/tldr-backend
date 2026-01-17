import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import {
  Attachment,
  Email,
  EmailCategory,
  Mailbox,
  MailboxSyncStatus,
} from '../entities';
import { AiService } from './ai.service';
import { GmailService, ParsedEmail } from './gmail.service';

interface SyncJob {
  mailboxId: number;
  retryCount: number;
  lastError?: string;
  scheduledAt: Date;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [60000, 300000, 900000];

@Injectable()
export class EmailSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailSyncService.name);
  private readonly retryQueue: Map<number, SyncJob> = new Map();
  private isSyncing = false;
  private isShuttingDown = false;

  constructor(
    @InjectRepository(Mailbox)
    private readonly mailboxRepository: Repository<Mailbox>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
    private readonly gmailService: GmailService,
    private readonly aiService: AiService,
  ) {}

  onModuleInit() {
    this.logger.log('Email sync service initialized');
  }

  onModuleDestroy() {
    this.logger.log('Email sync service shutting down, stopping tasks...');
    this.isShuttingDown = true;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledTokenRefresh() {
    if (this.isShuttingDown) return;
    this.logger.debug('Running scheduled token refresh');

    const expiringMailboxes = await this.mailboxRepository.find({
      where: {
        isActive: true,
        tokenExpiresAt: LessThan(new Date(Date.now() + 10 * 60 * 1000)),
      },
    });

    for (const mailbox of expiringMailboxes) {
      await this.refreshMailboxTokens(mailbox);
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async scheduledIncrementalSync() {
    if (this.isSyncing || this.isShuttingDown) {
      this.logger.debug('Sync already in progress or shutting down, skipping');
      return;
    }

    this.logger.debug('Running scheduled incremental sync');

    // Find mailboxes ready to sync (SYNCED, ERROR, or PENDING status)
    const mailboxes = await this.mailboxRepository.find({
      where: [
        { isActive: true, syncStatus: MailboxSyncStatus.SYNCED },
        { isActive: true, syncStatus: MailboxSyncStatus.ERROR },
        { isActive: true, syncStatus: MailboxSyncStatus.PENDING },
      ],
    });

    // Also check for stuck mailboxes (SYNCING for more than 5 minutes)
    const stuckThreshold = new Date(Date.now() - 5 * 60 * 1000);
    const stuckMailboxes = await this.mailboxRepository.find({
      where: {
        isActive: true,
        syncStatus: MailboxSyncStatus.SYNCING,
        updatedAt: LessThan(stuckThreshold),
      },
    });

    if (stuckMailboxes.length > 0) {
      this.logger.warn(
        `Found ${stuckMailboxes.length} stuck mailboxes, resetting to SYNCED`,
      );
      for (const mailbox of stuckMailboxes) {
        await this.mailboxRepository.update(mailbox.id, {
          syncStatus: MailboxSyncStatus.SYNCED,
        });
      }
      // Add reset mailboxes to the sync list
      mailboxes.push(...stuckMailboxes);
    }

    if (mailboxes.length > 0) {
      this.logger.debug(`Found ${mailboxes.length} mailboxes to sync`);
    }

    for (const mailbox of mailboxes) {
      await this.incrementalSync(mailbox.id);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processRetryQueue() {
    const now = Date.now();

    for (const [mailboxId, job] of this.retryQueue.entries()) {
      if (job.scheduledAt.getTime() <= now) {
        this.logger.log(
          `Retrying sync for mailbox ${mailboxId}, attempt ${job.retryCount + 1}`,
        );
        this.retryQueue.delete(mailboxId);
        await this.incrementalSync(mailboxId);
      }
    }
  }

  async refreshMailboxTokens(mailbox: Mailbox): Promise<void> {
    try {
      const { accessToken, expiresAt } =
        await this.gmailService.refreshTokens(mailbox);

      await this.mailboxRepository.update(mailbox.id, {
        encryptedAccessToken: this.gmailService.encryptToken(accessToken),
        tokenExpiresAt: expiresAt,
      });

      this.logger.log(`Refreshed tokens for mailbox ${mailbox.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to refresh tokens for mailbox ${mailbox.id}: ${(error as Error).message}`,
      );

      await this.mailboxRepository.update(mailbox.id, {
        syncStatus: MailboxSyncStatus.ERROR,
        lastSyncError: `Token refresh failed: ${(error as Error).message}`,
      });
    }
  }

  async fullSync(mailboxId: number, maxEmails: number = 200): Promise<void> {
    const mailbox = await this.mailboxRepository.findOne({
      where: { id: mailboxId },
    });

    if (!mailbox) {
      throw new Error(`Mailbox ${mailboxId} not found`);
    }

    this.isSyncing = true;

    try {
      await this.mailboxRepository.update(mailboxId, {
        syncStatus: MailboxSyncStatus.SYNCING,
      });

      this.logger.log(
        `Starting full sync for mailbox ${mailboxId} (max ${maxEmails} emails)`,
      );

      const profile = await this.gmailService.getProfile(mailbox);

      let pageToken: string | undefined;
      let totalSynced = 0;
      let pagesProcessed = 0;

      do {
        const { messages, nextPageToken } =
          await this.gmailService.listMessages(mailbox, {
            maxResults: Math.min(50, maxEmails - totalSynced), // Smaller batches for faster response
            pageToken,
            labelIds: ['INBOX'],
          });

        if (messages.length > 0) {
          const messageIds = messages.map((m) => m.id);
          const parsedEmails = await this.gmailService.getMessages(
            mailbox,
            messageIds,
          );

          for (const parsedEmail of parsedEmails) {
            await this.saveEmail(mailbox, parsedEmail);
          }

          totalSynced += parsedEmails.length;
          pagesProcessed++;

          this.logger.log(
            `Full sync progress: ${totalSynced} emails synced (page ${pagesProcessed})`,
          );
        }

        pageToken = nextPageToken;

        // Stop if we've reached the max emails limit
        if (totalSynced >= maxEmails) {
          this.logger.log(
            `Reached max emails limit (${maxEmails}), stopping full sync`,
          );
          break;
        }
      } while (pageToken);

      await this.mailboxRepository.update(mailboxId, {
        syncStatus: MailboxSyncStatus.SYNCED,
        lastSyncAt: new Date(),
        lastSyncError: null,
        historyId: profile.historyId,
        totalEmails: totalSynced,
      });

      await this.updateUnreadCount(mailboxId);

      this.logger.log(
        `Full sync completed for mailbox ${mailboxId}: ${totalSynced} emails`,
      );
    } catch (error) {
      await this.handleSyncError(mailboxId, error as Error);
    } finally {
      this.isSyncing = false;
    }
  }

  async incrementalSync(mailboxId: number): Promise<void> {
    const mailbox = await this.mailboxRepository.findOne({
      where: { id: mailboxId },
    });

    if (!mailbox) {
      throw new Error(`Mailbox ${mailboxId} not found`);
    }

    if (!mailbox.historyId) {
      return this.fullSync(mailboxId);
    }

    this.isSyncing = true;

    try {
      await this.mailboxRepository.update(mailboxId, {
        syncStatus: MailboxSyncStatus.SYNCING,
      });

      const changes = await this.gmailService.getHistoryChanges(
        mailbox,
        mailbox.historyId,
      );

      this.logger.debug(
        `Changes for ${mailbox.email}: ${changes.messagesAdded.length} added, ${changes.messagesDeleted.length} deleted, ${changes.labelsModified.length} labels modified`,
      );

      if (changes.messagesAdded.length > 0) {
        const parsedEmails = await this.gmailService.getMessages(
          mailbox,
          changes.messagesAdded,
        );

        for (const parsedEmail of parsedEmails) {
          await this.saveEmail(mailbox, parsedEmail);
        }

        this.logger.log(
          `Added ${parsedEmails.length} new emails for mailbox ${mailboxId}`,
        );
      }

      if (changes.messagesDeleted.length > 0) {
        await this.emailRepository.softDelete({
          mailboxId,
          gmailMessageId: changes.messagesDeleted as unknown as string,
        });

        this.logger.log(
          `Soft-deleted ${changes.messagesDeleted.length} emails for mailbox ${mailboxId}`,
        );
      }

      for (const labelChange of changes.labelsModified) {
        const email = await this.emailRepository.findOne({
          where: { mailboxId, gmailMessageId: labelChange.messageId },
        });

        if (email) {
          const updatedLabels = [
            ...new Set([
              ...(email.labels || []).filter(
                (l) => !labelChange.labelsRemoved.includes(l),
              ),
              ...labelChange.labelsAdded,
            ]),
          ];

          await this.emailRepository.update(email.id, {
            labels: updatedLabels,
            isRead: !updatedLabels.includes('UNREAD'),
            isStarred: updatedLabels.includes('STARRED'),
          });
        }
      }

      await this.mailboxRepository.update(mailboxId, {
        syncStatus: MailboxSyncStatus.SYNCED,
        lastSyncAt: new Date(),
        lastSyncError: null,
        historyId: changes.historyId,
      });

      await this.updateUnreadCount(mailboxId);

      this.retryQueue.delete(mailboxId);

      this.logger.log(`Incremental sync completed for mailbox ${mailboxId}`);
    } catch (error) {
      const err = error as Error & { code?: number; status?: number };

      // Gmail API returns 404 when historyId is too old (> 7 days)
      // In this case, we need to do a full sync
      if (err.code === 404 || err.status === 404 || err.message?.includes('404')) {
        this.logger.warn(
          `HistoryId ${mailbox.historyId} is stale for mailbox ${mailboxId}, triggering full sync`,
        );

        // Reset historyId and trigger full sync
        await this.mailboxRepository.update(mailboxId, {
          historyId: null,
          syncStatus: MailboxSyncStatus.PENDING,
        });

        this.isSyncing = false;
        return this.fullSync(mailboxId);
      }

      await this.handleSyncError(mailboxId, err);
    } finally {
      this.isSyncing = false;
    }
  }

  async syncOnDemand(mailboxId: number): Promise<void> {
    const mailbox = await this.mailboxRepository.findOne({
      where: { id: mailboxId },
    });

    if (!mailbox) {
      throw new Error(`Mailbox ${mailboxId} not found`);
    }

    if (mailbox.syncStatus === MailboxSyncStatus.SYNCING) {
      this.logger.warn(`Mailbox ${mailboxId} is already syncing`);
      return;
    }

    if (mailbox.historyId) {
      await this.incrementalSync(mailboxId);
    } else {
      await this.fullSync(mailboxId);
    }
  }

  private async saveEmail(
    mailbox: Mailbox,
    parsedEmail: ParsedEmail,
  ): Promise<Email> {
    let email = await this.emailRepository.findOne({
      where: {
        mailboxId: mailbox.id,
        gmailMessageId: parsedEmail.gmailMessageId,
      },
    });

    const emailData = {
      mailboxId: mailbox.id,
      gmailMessageId: parsedEmail.gmailMessageId,
      gmailThreadId: parsedEmail.gmailThreadId,
      subject: parsedEmail.subject,
      snippet: parsedEmail.snippet,
      fromEmail: parsedEmail.fromEmail,
      fromName: parsedEmail.fromName,
      toEmails: parsedEmail.toEmails,
      ccEmails: parsedEmail.ccEmails,
      bccEmails: parsedEmail.bccEmails,
      bodyHtml: parsedEmail.bodyHtml,
      bodyText: parsedEmail.bodyText,
      receivedAt: parsedEmail.receivedAt,
      isRead: parsedEmail.isRead,
      isStarred: parsedEmail.isStarred,
      hasAttachments: parsedEmail.attachments.length > 0,
      labels: parsedEmail.labels,
      category: this.categorizeEmail(parsedEmail.labels),
    };

    const isNewEmail = !email;

    if (email) {
      await this.emailRepository.update(email.id, emailData);
    } else {
      email = this.emailRepository.create(emailData);
      email = await this.emailRepository.save(email);

      if (parsedEmail.attachments.length > 0) {
        const attachments = parsedEmail.attachments.map((att) =>
          this.attachmentRepository.create({
            emailId: email!.id,
            gmailAttachmentId: att.gmailAttachmentId,
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            contentId: att.contentId,
            isInline: att.isInline,
          }),
        );
        await this.attachmentRepository.save(attachments);
      }

      // Generate embedding for new email asynchronously
      if (isNewEmail && email) {
        this.generateEmbeddingAsync(email.id);
      }
    }

    return email;
  }

  private categorizeEmail(labels: string[]): EmailCategory {
    if (labels.includes('CATEGORY_SOCIAL')) return EmailCategory.SOCIAL;
    if (labels.includes('CATEGORY_PROMOTIONS')) return EmailCategory.PROMOTIONS;
    if (labels.includes('CATEGORY_UPDATES')) return EmailCategory.UPDATES;
    if (labels.includes('CATEGORY_FORUMS')) return EmailCategory.FORUMS;
    return EmailCategory.PRIMARY;
  }

  private async updateUnreadCount(mailboxId: number): Promise<void> {
    const unreadCount = await this.emailRepository.count({
      where: { mailboxId, isRead: false, deletedAt: IsNull() },
    });

    const totalEmails = await this.emailRepository.count({
      where: { mailboxId, deletedAt: IsNull() },
    });

    await this.mailboxRepository.update(mailboxId, {
      unreadCount,
      totalEmails,
    });
  }

  /**
   * Generate embedding for an email asynchronously
   * Does not block the sync process
   */
  private generateEmbeddingAsync(emailId: number): void {
    setImmediate(() => {
      void (async () => {
        try {
          const email = await this.emailRepository.findOne({
            where: { id: emailId },
          });

          if (!email) {
            this.logger.warn(
              `Email ${emailId} not found for embedding generation`,
            );
            return;
          }

          const content = this.aiService.prepareEmailContentForEmbedding(email);
          const embedding = await this.aiService.generateEmbedding(content);

          // Use raw SQL to update embedding since it's not managed by @Column decorator
          const vectorString = `[${embedding.join(',')}]`;
          await this.emailRepository.query(
            `UPDATE emails SET embedding = $1::vector, "embeddingGeneratedAt" = $2 WHERE id = $3`,
            [vectorString, new Date(), emailId],
          );

          this.logger.log(`Generated embedding for email ${emailId}`);
        } catch (error) {
          this.logger.error(
            `Failed to generate embedding for email ${emailId}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      })();
    });
  }

  private async handleSyncError(
    mailboxId: number,
    error: Error,
  ): Promise<void> {
    this.logger.error(`Sync failed for mailbox ${mailboxId}: ${error.message}`);

    const existingJob = this.retryQueue.get(mailboxId);
    const retryCount = existingJob ? existingJob.retryCount + 1 : 0;

    if (retryCount < MAX_RETRIES) {
      const delay =
        RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];

      this.retryQueue.set(mailboxId, {
        mailboxId,
        retryCount,
        lastError: error.message,
        scheduledAt: new Date(Date.now() + delay),
      });

      this.logger.log(
        `Scheduled retry ${retryCount + 1}/${MAX_RETRIES} for mailbox ${mailboxId} in ${delay / 1000}s`,
      );

      await this.mailboxRepository.update(mailboxId, {
        syncStatus: MailboxSyncStatus.ERROR,
        lastSyncError: `${error.message} (retry ${retryCount + 1}/${MAX_RETRIES} scheduled)`,
      });
    } else {
      this.retryQueue.delete(mailboxId);

      await this.mailboxRepository.update(mailboxId, {
        syncStatus: MailboxSyncStatus.ERROR,
        lastSyncError: `${error.message} (max retries exceeded)`,
      });

      this.logger.error(`Max retries exceeded for mailbox ${mailboxId}`);
    }
  }
}
