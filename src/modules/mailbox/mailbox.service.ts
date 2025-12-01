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
import { ConnectMailboxDto } from './dto';
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

  async syncMailbox(userId: number, mailboxId: number): Promise<void> {
    const mailbox = await this.findOneByUser(userId, mailboxId);
    await this.emailSyncService.syncOnDemand(mailbox.id);
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
}
