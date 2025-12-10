import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository } from 'typeorm';
import {
  EmailQueryDto,
  EmailSummaryDto,
  PaginatedEmailsDto,
  SendEmailDto,
  SummarizeEmailResponseDto,
  UpdateEmailDto,
} from './dto';
import { Email, Mailbox } from './entities';
import { AiService } from './providers/ai.service';
import { GmailService } from './providers/gmail.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(Mailbox)
    private readonly mailboxRepository: Repository<Mailbox>,
    private readonly gmailService: GmailService,
    private readonly aiService: AiService,
  ) {}

  async findAll(
    userId: number,
    query: EmailQueryDto,
    baseUrl: string,
  ): Promise<PaginatedEmailsDto> {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const userMailboxIds = await this.getUserMailboxIds(userId);

    if (userMailboxIds.length === 0) {
      return this.emptyPaginatedResponse(page, limit, baseUrl, query);
    }

    const qb = this.emailRepository
      .createQueryBuilder('email')
      .where('email.mailboxId IN (:...mailboxIds)', {
        mailboxIds: userMailboxIds,
      })
      .andWhere('email.deletedAt IS NULL');

    if (query.mailboxId) {
      if (!userMailboxIds.includes(query.mailboxId)) {
        return this.emptyPaginatedResponse(page, limit, baseUrl, query);
      }
      qb.andWhere('email.mailboxId = :mailboxId', {
        mailboxId: query.mailboxId,
      });
    }

    if (query.search) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('email.subject ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('email.snippet ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('email.fromEmail ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('email.fromName ILIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }

    if (query.isRead !== undefined) {
      qb.andWhere('email.isRead = :isRead', { isRead: query.isRead });
    }

    if (query.isStarred !== undefined) {
      qb.andWhere('email.isStarred = :isStarred', {
        isStarred: query.isStarred,
      });
    }

    if (query.hasAttachments !== undefined) {
      qb.andWhere('email.hasAttachments = :hasAttachments', {
        hasAttachments: query.hasAttachments,
      });
    }

    if (query.category) {
      qb.andWhere('email.category = :category', { category: query.category });
    }

    if (query.taskStatus) {
      qb.andWhere('email.taskStatus = :taskStatus', {
        taskStatus: query.taskStatus,
      });
    }

    if (query.fromEmail) {
      qb.andWhere('email.fromEmail ILIKE :fromEmail', {
        fromEmail: `%${query.fromEmail}%`,
      });
    }

    if (query.label) {
      qb.andWhere(':label = ANY(email.labels)', { label: query.label });
    }

    if (query.isSnoozed !== undefined) {
      qb.andWhere('email.isSnoozed = :isSnoozed', {
        isSnoozed: query.isSnoozed,
      });
    }

    const sortField = `email.${query.sortBy || 'receivedAt'}`;
    qb.orderBy(sortField, query.sortOrder || 'DESC');

    qb.addOrderBy('email.isPinned', 'DESC');

    const [emails, totalItems] = await qb
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: emails.map((email) => this.toSummaryDto(email)),
      meta: {
        itemsPerPage: limit,
        totalItems,
        currentPage: page,
        totalPages,
      },
      links: this.buildPaginationLinks(baseUrl, page, totalPages, limit, query),
    };
  }

  async findOne(userId: number, emailId: number): Promise<Email> {
    const userMailboxIds = await this.getUserMailboxIds(userId);

    const email = await this.emailRepository.findOne({
      where: { id: emailId, deletedAt: IsNull() },
      relations: ['attachments'],
    });

    if (!email || !userMailboxIds.includes(email.mailboxId)) {
      throw new NotFoundException(`Email with ID ${emailId} not found`);
    }

    return email;
  }

  async update(
    userId: number,
    emailId: number,
    updateDto: UpdateEmailDto,
  ): Promise<Email> {
    const email = await this.findOne(userId, emailId);

    if (updateDto.isRead !== undefined) {
      email.isRead = updateDto.isRead;
    }
    if (updateDto.isStarred !== undefined) {
      email.isStarred = updateDto.isStarred;
    }
    if (updateDto.isPinned !== undefined) {
      email.isPinned = updateDto.isPinned;
    }
    if (updateDto.taskStatus !== undefined) {
      email.taskStatus = updateDto.taskStatus;
    }
    if (updateDto.taskDeadline !== undefined) {
      email.taskDeadline = new Date(updateDto.taskDeadline);
    }
    if (updateDto.snoozedUntil !== undefined) {
      if (updateDto.snoozedUntil === null) {
        email.isSnoozed = false;
        email.snoozedUntil = null;
      } else {
        email.isSnoozed = true;
        email.snoozedUntil = new Date(updateDto.snoozedUntil);
      }
    }

    await this.emailRepository.save(email);

    if (updateDto.isRead !== undefined) {
      await this.updateMailboxUnreadCount(email.mailboxId);
    }

    this.logger.log(`Updated email ${emailId}`);

    return this.findOne(userId, emailId);
  }

  async softDelete(userId: number, emailId: number): Promise<void> {
    const email = await this.findOne(userId, emailId);
    await this.emailRepository.softDelete(emailId);
    await this.updateMailboxUnreadCount(email.mailboxId);
    this.logger.log(`Soft-deleted email ${emailId}`);
  }

  private async getUserMailboxIds(userId: number): Promise<number[]> {
    const mailboxes = await this.mailboxRepository.find({
      where: { userId, deletedAt: IsNull() },
      select: ['id'],
    });
    return mailboxes.map((m) => m.id);
  }

  private async updateMailboxUnreadCount(mailboxId: number): Promise<void> {
    const unreadCount = await this.emailRepository.count({
      where: { mailboxId, isRead: false, deletedAt: IsNull() },
    });

    await this.mailboxRepository.update(mailboxId, { unreadCount });
  }

  private toSummaryDto(email: Email): EmailSummaryDto {
    return {
      id: email.id,
      mailboxId: email.mailboxId,
      gmailMessageId: email.gmailMessageId,
      gmailThreadId: email.gmailThreadId,
      subject: email.subject,
      snippet: email.snippet,
      fromEmail: email.fromEmail,
      fromName: email.fromName,
      receivedAt: email.receivedAt,
      isRead: email.isRead,
      isStarred: email.isStarred,
      hasAttachments: email.hasAttachments,
      category: email.category,
      taskStatus: email.taskStatus,
      isPinned: email.isPinned,
      isSnoozed: email.isSnoozed,
      snoozedUntil: email.snoozedUntil,
      aiSummary: email.aiSummary,
    };
  }

  private buildPaginationLinks(
    baseUrl: string,
    currentPage: number,
    totalPages: number,
    limit: number,
    query: EmailQueryDto,
  ) {
    const buildUrl = (page: number) => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());

      if (query.mailboxId) params.set('mailboxId', query.mailboxId.toString());
      if (query.search) params.set('search', query.search);
      if (query.isRead !== undefined)
        params.set('isRead', query.isRead.toString());
      if (query.isStarred !== undefined)
        params.set('isStarred', query.isStarred.toString());
      if (query.hasAttachments !== undefined)
        params.set('hasAttachments', query.hasAttachments.toString());
      if (query.category) params.set('category', query.category);
      if (query.taskStatus) params.set('taskStatus', query.taskStatus);
      if (query.fromEmail) params.set('fromEmail', query.fromEmail);
      if (query.label) params.set('label', query.label);
      if (query.sortBy && query.sortBy !== 'receivedAt')
        params.set('sortBy', query.sortBy);
      if (query.sortOrder && query.sortOrder !== 'DESC')
        params.set('sortOrder', query.sortOrder);

      return `${baseUrl}?${params.toString()}`;
    };

    return {
      first: buildUrl(1),
      last: buildUrl(Math.max(1, totalPages)),
      current: buildUrl(currentPage),
      next: currentPage < totalPages ? buildUrl(currentPage + 1) : null,
      previous: currentPage > 1 ? buildUrl(currentPage - 1) : null,
    };
  }

  private emptyPaginatedResponse(
    page: number,
    limit: number,
    baseUrl: string,
    query: EmailQueryDto,
  ): PaginatedEmailsDto {
    return {
      data: [],
      meta: {
        itemsPerPage: limit,
        totalItems: 0,
        currentPage: page,
        totalPages: 0,
      },
      links: this.buildPaginationLinks(baseUrl, page, 1, limit, query),
    };
  }

  async sendEmail(
    userId: number,
    sendDto: SendEmailDto,
  ): Promise<{ messageId: string }> {
    // Verify mailbox belongs to user
    const mailbox = await this.mailboxRepository.findOne({
      where: { id: sendDto.mailboxId, userId, deletedAt: IsNull() },
    });

    if (!mailbox) {
      throw new NotFoundException(`Mailbox ${sendDto.mailboxId} not found`);
    }

    // Check if token is expired or about to expire (within 5 minutes)
    const now = new Date();
    const expiresAt = mailbox.tokenExpiresAt;
    const needsRefresh =
      !expiresAt || expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;

    if (needsRefresh) {
      this.logger.log(`Refreshing expired token for mailbox ${mailbox.id}`);
      const { accessToken, expiresAt: newExpiresAt } =
        await this.gmailService.refreshTokens(mailbox);

      // Update mailbox with new token
      mailbox.encryptedAccessToken = accessToken;
      mailbox.tokenExpiresAt = newExpiresAt;
      await this.mailboxRepository.save(mailbox);
    }

    // Send via Gmail API
    const messageId = await this.gmailService.sendEmail(mailbox, {
      to: sendDto.to,
      cc: sendDto.cc,
      bcc: sendDto.bcc,
      subject: sendDto.subject,
      body: sendDto.body,
      bodyHtml: sendDto.bodyHtml,
      inReplyTo: sendDto.inReplyTo,
      threadId: sendDto.threadId,
    });

    this.logger.log(
      `Sent email from mailbox ${mailbox.id} to ${sendDto.to.join(', ')}`,
    );

    return { messageId };
  }

  async summarizeEmail(
    userId: number,
    emailId: number,
  ): Promise<SummarizeEmailResponseDto> {
    const email = await this.findOne(userId, emailId);

    // Use bodyText if available, otherwise use snippet
    const content = email.bodyText || email.snippet || email.subject || '';

    if (!content) {
      throw new NotFoundException(
        `Email ${emailId} has no content to summarize`,
      );
    }

    // Generate summary using AI service
    const summary = await this.aiService.summarizeEmail(content);

    // Save summary to database
    email.aiSummary = summary;
    await this.emailRepository.save(email);

    this.logger.log(`Generated and saved summary for email ${emailId}`);

    return {
      emailId,
      summary,
      saved: true,
    };
  }
}
