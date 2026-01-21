import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { OAuth2Client } from 'google-auth-library';
import { IsNull, Repository } from 'typeorm';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import {
  ConnectMailboxDto,
  GmailLabelDto,
  GmailLabelsResponseDto,
} from './dto';
import { Mailbox, MailboxProvider, MailboxSyncStatus } from './entities';
import { EmailSyncService } from './providers/email-sync.service';
import { GmailService } from './providers/gmail.service';

@Injectable()
export class MailboxService {
  private readonly logger = new Logger(MailboxService.name);
  private readonly encryptionUtil: EncryptionUtil;

  constructor(
    @InjectRepository(Mailbox)
    private readonly mailboxRepository: Repository<Mailbox>,
    private readonly configService: ConfigService,
    private readonly gmailService: GmailService,
    private readonly emailSyncService: EmailSyncService,
  ) {
    const encryptionKey = this.configService.get<string>('encryption.key');
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY is not configured');
    }
    this.encryptionUtil = new EncryptionUtil(encryptionKey);
  }

  async findAllByUser(userId: number): Promise<Mailbox[]> {
    return this.mailboxRepository.find({
      where: { userId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneByUser(userId: number, mailboxId: number): Promise<Mailbox> {
    const mailbox = await this.mailboxRepository.findOne({
      where: { id: mailboxId, userId, deletedAt: IsNull() },
    });

    if (!mailbox) {
      throw new NotFoundException(`Mailbox with ID ${mailboxId} not found`);
    }

    return mailbox;
  }

  async connectGmailMailbox(
    userId: number,
    connectDto: ConnectMailboxDto,
  ): Promise<Mailbox> {
    const oauth2Client = new OAuth2Client(
      this.configService.get<string>('googleOAuth.clientId'),
      this.configService.get<string>('googleOAuth.clientSecret'),
      this.configService.get<string>('googleOAuth.redirectUri'),
    );

    const { tokens } = await oauth2Client.getToken({
      code: connectDto.code,
      codeVerifier: connectDto.codeVerifier,
    });

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Failed to obtain Gmail tokens');
    }

    oauth2Client.setCredentials(tokens);

    const gmail = (await import('googleapis')).google.gmail({
      version: 'v1',
      auth: oauth2Client,
    });

    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress;

    if (!email) {
      throw new Error('Failed to get Gmail email address');
    }

    const existingMailbox = await this.mailboxRepository.findOne({
      where: { userId, email, deletedAt: IsNull() },
    });

    if (existingMailbox) {
      throw new ConflictException(`Mailbox ${email} is already connected`);
    }

    const mailbox = this.mailboxRepository.create({
      userId,
      email,
      provider: MailboxProvider.GMAIL,
      encryptedAccessToken: this.encryptionUtil.encrypt(tokens.access_token),
      encryptedRefreshToken: this.encryptionUtil.encrypt(tokens.refresh_token),
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      syncStatus: MailboxSyncStatus.PENDING,
      historyId: profile.data.historyId || null,
    });

    const savedMailbox = await this.mailboxRepository.save(mailbox);

    this.logger.log(`Connected Gmail mailbox ${email} for user ${userId}`);

    setImmediate(() => {
      this.emailSyncService.fullSync(savedMailbox.id).catch((err: Error) => {
        this.logger.error(
          `Initial sync failed for mailbox ${savedMailbox.id}: ${err.message}`,
        );
      });
    });

    return savedMailbox;
  }

  async syncMailbox(userId: number, mailboxId: number, forceFullSync = false): Promise<void> {
    const mailbox = await this.findOneByUser(userId, mailboxId);
    this.logger.log(`Sync requested for mailbox ${mailboxId}, forceFullSync: ${forceFullSync}`);
    await this.emailSyncService.syncOnDemand(mailbox.id, forceFullSync);
  }

  /**
   * Create mailbox directly from OAuth tokens (called during login)
   */
  async createGmailMailboxFromTokens(
    userId: number,
    email: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    historyId: string | null,
  ): Promise<Mailbox> {
    const existingMailbox = await this.mailboxRepository.findOne({
      where: { userId, email, deletedAt: IsNull() },
    });

    if (existingMailbox) {
      this.logger.log(`Mailbox ${email} already exists for user ${userId}`);
      return existingMailbox;
    }

    const expiryDate = new Date(Date.now() + expiresIn * 1000);

    const mailbox = this.mailboxRepository.create({
      userId,
      email,
      provider: MailboxProvider.GMAIL,
      encryptedAccessToken: this.encryptionUtil.encrypt(accessToken),
      encryptedRefreshToken: this.encryptionUtil.encrypt(refreshToken),
      tokenExpiresAt: expiryDate,
      syncStatus: MailboxSyncStatus.PENDING,
      historyId: historyId || null,
    });

    const savedMailbox = await this.mailboxRepository.save(mailbox);

    this.logger.log(`Created Gmail mailbox ${email} for user ${userId}`);

    // Trigger background sync
    setImmediate(() => {
      this.emailSyncService.fullSync(savedMailbox.id).catch((err: Error) => {
        this.logger.error(
          `Initial sync failed for mailbox ${savedMailbox.id}: ${err.message}`,
        );
      });
    });

    return savedMailbox;
  }

  async disconnectMailbox(userId: number, mailboxId: number): Promise<void> {
    const mailbox = await this.findOneByUser(userId, mailboxId);

    await this.mailboxRepository.softDelete(mailbox.id);

    this.logger.log(`Disconnected mailbox ${mailbox.email} for user ${userId}`);
  }

  async updateMailboxStatus(
    mailboxId: number,
    isActive: boolean,
  ): Promise<Mailbox> {
    const mailbox = await this.mailboxRepository.findOne({
      where: { id: mailboxId },
    });

    if (!mailbox) {
      throw new NotFoundException(`Mailbox with ID ${mailboxId} not found`);
    }

    mailbox.isActive = isActive;
    return this.mailboxRepository.save(mailbox);
  }

  /**
   * Get Gmail labels for a mailbox
   */
  async getGmailLabels(
    userId: number,
    mailboxId: number,
  ): Promise<GmailLabelsResponseDto> {
    const mailbox = await this.findOneByUser(userId, mailboxId);

    // Check if token is expired or about to expire (within 5 minutes)
    const now = new Date();
    const expiresAt = mailbox.tokenExpiresAt;
    const needsRefresh =
      !expiresAt || expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;

    if (needsRefresh) {
      this.logger.log(`Refreshing expired token for mailbox ${mailbox.id}`);
      const { accessToken, expiresAt: newExpiresAt } =
        await this.gmailService.refreshTokens(mailbox);

      // Update mailbox with new encrypted token
      mailbox.encryptedAccessToken =
        this.encryptionUtil.encrypt(accessToken);
      mailbox.tokenExpiresAt = newExpiresAt;
      await this.mailboxRepository.save(mailbox);
    }

    const gmailLabels = await this.gmailService.listLabels(mailbox);

    const systemLabels: GmailLabelDto[] = [];
    const userLabels: GmailLabelDto[] = [];

    // System labels to include (others are hidden internal labels)
    const visibleSystemLabels = new Set([
      'INBOX',
      'SENT',
      'DRAFT',
      'TRASH',
      'SPAM',
      'STARRED',
      'IMPORTANT',
      'CATEGORY_PERSONAL',
      'CATEGORY_SOCIAL',
      'CATEGORY_PROMOTIONS',
      'CATEGORY_UPDATES',
      'CATEGORY_FORUMS',
    ]);

    for (const label of gmailLabels) {
      if (!label.id || !label.name) continue;

      const labelDto: GmailLabelDto = {
        id: label.id,
        name: label.name,
        type: label.type === 'user' ? 'user' : 'system',
        messagesTotal: label.messagesTotal ?? undefined,
        messagesUnread: label.messagesUnread ?? undefined,
        backgroundColor: label.color?.backgroundColor ?? undefined,
        textColor: label.color?.textColor ?? undefined,
      };

      if (label.type === 'user') {
        userLabels.push(labelDto);
      } else if (visibleSystemLabels.has(label.id)) {
        systemLabels.push(labelDto);
      }
    }

    // Sort user labels alphabetically
    userLabels.sort((a, b) => a.name.localeCompare(b.name));

    this.logger.log(
      `Retrieved ${systemLabels.length} system labels and ${userLabels.length} user labels for mailbox ${mailboxId}`,
    );

    return { system: systemLabels, user: userLabels };
  }
}
