import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { gmail_v1, google } from 'googleapis';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { Mailbox } from '../entities/mailbox.entity';

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: gmail_v1.Schema$MessagePart;
  internalDate: string;
}

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface ParsedEmail {
  gmailMessageId: string;
  gmailThreadId: string;
  subject: string | null;
  snippet: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  bodyHtml: string | null;
  bodyText: string | null;
  receivedAt: Date;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  attachments: ParsedAttachment[];
}

export interface ParsedAttachment {
  gmailAttachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId: string | null;
  isInline: boolean;
}

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);
  private readonly encryptionUtil: EncryptionUtil;

  constructor(private readonly configService: ConfigService) {
    const encryptionKey = this.configService.get<string>('encryption.key');
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY is not configured');
    }
    this.encryptionUtil = new EncryptionUtil(encryptionKey);
  }

  private createOAuth2Client() {
    return new google.auth.OAuth2(
      this.configService.get<string>('googleOAuth.clientId'),
      this.configService.get<string>('googleOAuth.clientSecret'),
      this.configService.get<string>('googleOAuth.redirectUri'),
    );
  }

  private getAuthenticatedClient(mailbox: Mailbox) {
    const oauth2Client = this.createOAuth2Client();

    if (!mailbox.encryptedAccessToken || !mailbox.encryptedRefreshToken) {
      throw new Error('Mailbox tokens not configured');
    }

    const accessToken = this.encryptionUtil.decrypt(
      mailbox.encryptedAccessToken,
    );
    const refreshToken = this.encryptionUtil.decrypt(
      mailbox.encryptedRefreshToken,
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: mailbox.tokenExpiresAt?.getTime(),
    });

    return {
      oauth2Client,
      gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
    };
  }

  async refreshTokens(
    mailbox: Mailbox,
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    const { oauth2Client } = this.getAuthenticatedClient(mailbox);

    const { credentials } = await oauth2Client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error('Failed to refresh access token');
    }

    this.logger.log(`Refreshed tokens for mailbox ${mailbox.id}`);

    return {
      accessToken: credentials.access_token,
      expiresAt: new Date(credentials.expiry_date || Date.now() + 3600000),
    };
  }

  async listMessages(
    mailbox: Mailbox,
    options: {
      maxResults?: number;
      pageToken?: string;
      query?: string;
      labelIds?: string[];
    } = {},
  ): Promise<{
    messages: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
  }> {
    const { gmail } = this.getAuthenticatedClient(mailbox);

    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: options.maxResults || 100,
      pageToken: options.pageToken,
      q: options.query,
      labelIds: options.labelIds,
    });

    const messages = (response.data.messages || [])
      .filter(
        (m): m is { id: string; threadId: string } => !!m.id && !!m.threadId,
      )
      .map((m) => ({ id: m.id, threadId: m.threadId }));

    return {
      messages,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  async getMessage(mailbox: Mailbox, messageId: string): Promise<ParsedEmail> {
    const { gmail } = this.getAuthenticatedClient(mailbox);

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    return this.parseMessage(response.data);
  }

  async getMessages(
    mailbox: Mailbox,
    messageIds: string[],
  ): Promise<ParsedEmail[]> {
    const { gmail } = this.getAuthenticatedClient(mailbox);
    const results: ParsedEmail[] = [];

    const batchSize = 50;
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      const promises = batch.map((id) =>
        gmail.users.messages
          .get({ userId: 'me', id, format: 'full' })
          .then((res) => this.parseMessage(res.data))
          .catch((error: Error) => {
            this.logger.warn(`Failed to fetch message ${id}: ${error.message}`);
            return null;
          }),
      );

      const batchResults = await Promise.all(promises);
      results.push(...batchResults.filter((r): r is ParsedEmail => r !== null));
    }

    return results;
  }

  async getAttachment(
    mailbox: Mailbox,
    messageId: string,
    attachmentId: string,
  ): Promise<Buffer> {
    const { gmail } = this.getAuthenticatedClient(mailbox);

    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });

    if (!response.data.data) {
      throw new Error('Attachment data not found');
    }

    return Buffer.from(response.data.data, 'base64url');
  }

  async getHistoryChanges(
    mailbox: Mailbox,
    startHistoryId: string,
  ): Promise<{
    historyId: string;
    messagesAdded: string[];
    messagesDeleted: string[];
    labelsModified: Array<{
      messageId: string;
      labelsAdded: string[];
      labelsRemoved: string[];
    }>;
  }> {
    const { gmail } = this.getAuthenticatedClient(mailbox);

    const response = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: [
        'messageAdded',
        'messageDeleted',
        'labelAdded',
        'labelRemoved',
      ],
    });

    const messagesAdded: string[] = [];
    const messagesDeleted: string[] = [];
    const labelsModified: Array<{
      messageId: string;
      labelsAdded: string[];
      labelsRemoved: string[];
    }> = [];

    for (const history of response.data.history || []) {
      if (history.messagesAdded) {
        messagesAdded.push(
          ...(history.messagesAdded
            .map((m) => m.message?.id)
            .filter(Boolean) as string[]),
        );
      }
      if (history.messagesDeleted) {
        messagesDeleted.push(
          ...(history.messagesDeleted
            .map((m) => m.message?.id)
            .filter(Boolean) as string[]),
        );
      }
      if (history.labelsAdded || history.labelsRemoved) {
        const messageId =
          history.labelsAdded?.[0]?.message?.id ||
          history.labelsRemoved?.[0]?.message?.id;
        if (messageId) {
          labelsModified.push({
            messageId,
            labelsAdded:
              history.labelsAdded?.flatMap((l) => l.labelIds || []) || [],
            labelsRemoved:
              history.labelsRemoved?.flatMap((l) => l.labelIds || []) || [],
          });
        }
      }
    }

    return {
      historyId: response.data.historyId || startHistoryId,
      messagesAdded: [...new Set(messagesAdded)],
      messagesDeleted: [...new Set(messagesDeleted)],
      labelsModified,
    };
  }

  async getProfile(mailbox: Mailbox): Promise<{
    emailAddress: string;
    messagesTotal: number;
    threadsTotal: number;
    historyId: string;
  }> {
    const { gmail } = this.getAuthenticatedClient(mailbox);

    const response = await gmail.users.getProfile({ userId: 'me' });

    return {
      emailAddress: response.data.emailAddress || '',
      messagesTotal: response.data.messagesTotal || 0,
      threadsTotal: response.data.threadsTotal || 0,
      historyId: response.data.historyId || '',
    };
  }

  encryptToken(token: string): string {
    return this.encryptionUtil.encrypt(token);
  }

  private parseMessage(message: gmail_v1.Schema$Message): ParsedEmail {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value || null;

    const from = this.parseEmailAddress(getHeader('From') || '');
    const to = this.parseEmailAddresses(getHeader('To') || '');
    const cc = this.parseEmailAddresses(getHeader('Cc') || '');
    const bcc = this.parseEmailAddresses(getHeader('Bcc') || '');

    const { bodyHtml, bodyText, attachments } = this.parseMessageParts(
      message.payload,
    );

    const labels = message.labelIds || [];
    const isRead = !labels.includes('UNREAD');
    const isStarred = labels.includes('STARRED');

    return {
      gmailMessageId: message.id || '',
      gmailThreadId: message.threadId || '',
      subject: getHeader('Subject'),
      snippet: message.snippet || null,
      fromEmail: from.email,
      fromName: from.name,
      toEmails: to.map((t) => t.email),
      ccEmails: cc.map((c) => c.email),
      bccEmails: bcc.map((b) => b.email),
      bodyHtml,
      bodyText,
      receivedAt: new Date(parseInt(message.internalDate || '0', 10)),
      isRead,
      isStarred,
      labels,
      attachments,
    };
  }

  private parseEmailAddress(input: string): {
    email: string;
    name: string | null;
  } {
    const match = input.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/);
    if (match) {
      return {
        name: match[1]?.trim() || null,
        email: match[2]?.trim() || input,
      };
    }
    return { email: input, name: null };
  }

  private parseEmailAddresses(
    input: string,
  ): Array<{ email: string; name: string | null }> {
    if (!input) return [];
    return input.split(',').map((addr) => this.parseEmailAddress(addr.trim()));
  }

  private parseMessageParts(payload: gmail_v1.Schema$MessagePart | undefined): {
    bodyHtml: string | null;
    bodyText: string | null;
    attachments: ParsedAttachment[];
  } {
    let bodyHtml: string | null = null;
    let bodyText: string | null = null;
    const attachments: ParsedAttachment[] = [];

    const processPart = (part: gmail_v1.Schema$MessagePart) => {
      const mimeType = part.mimeType || '';
      const body = part.body;

      if (body?.attachmentId) {
        attachments.push({
          gmailAttachmentId: body.attachmentId,
          filename: part.filename || 'unnamed',
          mimeType,
          size: body.size || 0,
          contentId:
            part.headers?.find((h) => h.name === 'Content-ID')?.value || null,
          isInline: !!part.headers
            ?.find((h) => h.name === 'Content-Disposition')
            ?.value?.includes('inline'),
        });
      } else if (body?.data) {
        const content = Buffer.from(body.data, 'base64url').toString('utf-8');
        if (mimeType === 'text/html') {
          bodyHtml = content;
        } else if (mimeType === 'text/plain') {
          bodyText = content;
        }
      }

      if (part.parts) {
        part.parts.forEach(processPart);
      }
    };

    if (payload) {
      processPart(payload);
    }

    return { bodyHtml, bodyText, attachments };
  }
}
