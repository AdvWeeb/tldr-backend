import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository } from 'typeorm';
import {
  EmailQueryDto,
  EmailSummaryDto,
  FuzzySearchDto,
  FuzzySearchField,
  FuzzySearchResponseDto,
  FuzzySearchResultDto,
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

  /**
   * Fuzzy search emails with typo tolerance and partial matching
   * Uses PostgreSQL pg_trgm extension for similarity matching
   *
   */
  async fuzzySearch(
    userId: number,
    searchDto: FuzzySearchDto,
  ): Promise<FuzzySearchResponseDto> {
    const {
      q = '',
      threshold = 0.2,
      fields = FuzzySearchField.ALL,
      mailboxId,
      page = 1,
      limit = 20,
      subjectWeight = 0.4,
      senderWeight = 0.3,
      bodyWeight = 0.3,
    } = searchDto;

    const userMailboxIds = await this.getUserMailboxIds(userId);

    if (userMailboxIds.length === 0 || !q.trim()) {
      return {
        data: [],
        meta: {
          query: q,
          threshold,
          totalResults: 0,
          page,
          limit,
          totalPages: 0,
        },
      };
    }

    const skip = (page - 1) * limit;

    // Build parameter array for positional binding
    const queryParams: any[] = [];
    let paramIndex = 1;

    // Helper to add parameter and return placeholder
    const addParam = (value: any): string => {
      queryParams.push(value);
      return `$${paramIndex++}`;
    };

    const queryPlaceholder = addParam(q);
    const wildcardQueryPlaceholder = addParam(`%${q}%`);
    const thresholdPlaceholder = addParam(threshold);
    const subjectWeightPlaceholder = addParam(subjectWeight);
    const senderWeightPlaceholder = addParam(senderWeight);
    const bodyWeightPlaceholder = addParam(bodyWeight);
    const mailboxIdsPlaceholder = addParam(userMailboxIds);

    // Build the fuzzy search query
    let selectQuery = `
      SELECT 
        email.*,
        -- Individual similarity scores using word_similarity for better partial matching
        GREATEST(
          COALESCE(word_similarity(${queryPlaceholder}, email.subject), 0),
          COALESCE(similarity(email.subject, ${queryPlaceholder}), 0)
        ) as subject_score,
        GREATEST(
          COALESCE(word_similarity(${queryPlaceholder}, email."fromName"), 0),
          COALESCE(similarity(email."fromName", ${queryPlaceholder}), 0),
          COALESCE(word_similarity(${queryPlaceholder}, email."fromEmail"), 0),
          COALESCE(similarity(email."fromEmail", ${queryPlaceholder}), 0)
        ) as sender_score,
    `;

    // Add body/summary scoring if requested
    if (fields === FuzzySearchField.ALL || fields === FuzzySearchField.BODY) {
      selectQuery += `
        COALESCE(
          ts_rank(
            to_tsvector('english', COALESCE(email."bodyText", '') || ' ' || COALESCE(email."aiSummary", '')),
            plainto_tsquery('english', ${queryPlaceholder})
          ),
          0
        ) as body_score,
      `;
    } else {
      selectQuery += `0 as body_score,`;
    }

    // Weighted combined relevance score
    selectQuery += `
        (
          GREATEST(
            COALESCE(word_similarity(${queryPlaceholder}, email.subject), 0),
            COALESCE(similarity(email.subject, ${queryPlaceholder}), 0)
          ) * ${subjectWeightPlaceholder} +
          GREATEST(
            COALESCE(word_similarity(${queryPlaceholder}, email."fromName"), 0),
            COALESCE(similarity(email."fromName", ${queryPlaceholder}), 0),
            COALESCE(word_similarity(${queryPlaceholder}, email."fromEmail"), 0),
            COALESCE(similarity(email."fromEmail", ${queryPlaceholder}), 0)
          ) * ${senderWeightPlaceholder} +
    `;

    if (fields === FuzzySearchField.ALL || fields === FuzzySearchField.BODY) {
      selectQuery += `
          COALESCE(
            ts_rank(
              to_tsvector('english', COALESCE(email."bodyText", '') || ' ' || COALESCE(email."aiSummary", '')),
              plainto_tsquery('english', ${queryPlaceholder})
            ),
            0
          ) * ${bodyWeightPlaceholder}
      `;
    } else {
      selectQuery += `0`;
    }

    selectQuery += `
        ) as relevance
      FROM emails email
      WHERE email."mailboxId" = ANY(${mailboxIdsPlaceholder})
        AND email."deletedAt" IS NULL
    `;

    // Add mailbox filter if specified
    if (mailboxId && userMailboxIds.includes(mailboxId)) {
      selectQuery += ` AND email."mailboxId" = ${addParam(mailboxId)}`;
    }

    // Build WHERE conditions based on search fields
    const conditions: string[] = [];

    if (
      fields === FuzzySearchField.ALL ||
      fields === FuzzySearchField.SUBJECT
    ) {
      conditions.push(`(
        word_similarity(${queryPlaceholder}, email.subject) > ${thresholdPlaceholder} OR
        similarity(email.subject, ${queryPlaceholder}) > ${thresholdPlaceholder} OR
        email.subject ILIKE ${wildcardQueryPlaceholder}
      )`);
    }

    if (fields === FuzzySearchField.ALL || fields === FuzzySearchField.SENDER) {
      conditions.push(`(
        word_similarity(${queryPlaceholder}, email."fromName") > ${thresholdPlaceholder} OR
        similarity(email."fromName", ${queryPlaceholder}) > ${thresholdPlaceholder} OR
        word_similarity(${queryPlaceholder}, email."fromEmail") > ${thresholdPlaceholder} OR
        similarity(email."fromEmail", ${queryPlaceholder}) > ${thresholdPlaceholder} OR
        email."fromName" ILIKE ${wildcardQueryPlaceholder} OR
        email."fromEmail" ILIKE ${wildcardQueryPlaceholder}
      )`);
    }

    if (fields === FuzzySearchField.ALL || fields === FuzzySearchField.BODY) {
      conditions.push(`
        to_tsvector('english', COALESCE(email."bodyText", '') || ' ' || COALESCE(email."aiSummary", ''))
        @@ plainto_tsquery('english', ${queryPlaceholder})
      `);
    }

    if (conditions.length > 0) {
      selectQuery += ` AND (${conditions.join(' OR ')})`;
    }

    selectQuery += `
      ORDER BY relevance DESC
      LIMIT ${addParam(limit)} OFFSET ${addParam(skip)}
    `;

    // Execute the fuzzy search query
    interface FuzzySearchRow {
      relevance: string;
      subject_score: string;
      sender_score: string;
      body_score: string;
      [key: string]: unknown; // Other email fields
    }
    const results = await this.emailRepository.query<FuzzySearchRow[]>(
      selectQuery,
      queryParams,
    );

    // Get total count for pagination
    const countParams: any[] = [];
    let countParamIndex = 1;

    const addCountParam = (value: any): string => {
      countParams.push(value);
      return `$${countParamIndex++}`;
    };

    const countQueryPlaceholder = addCountParam(q);
    const countWildcardQueryPlaceholder = addCountParam(`%${q}%`);
    const countThresholdPlaceholder = addCountParam(threshold);

    let countQuery = `
      SELECT COUNT(*) as total
      FROM emails email
      WHERE email."mailboxId" = ANY(${addCountParam(userMailboxIds)})
        AND email."deletedAt" IS NULL
    `;

    if (mailboxId && userMailboxIds.includes(mailboxId)) {
      countQuery += ` AND email."mailboxId" = ${addCountParam(mailboxId)}`;
    }

    // Rebuild conditions for count query with new parameter indices
    const countConditions: string[] = [];

    if (
      fields === FuzzySearchField.ALL ||
      fields === FuzzySearchField.SUBJECT
    ) {
      countConditions.push(`(
        word_similarity(${countQueryPlaceholder}, email.subject) > ${countThresholdPlaceholder} OR
        similarity(email.subject, ${countQueryPlaceholder}) > ${countThresholdPlaceholder} OR
        email.subject ILIKE ${countWildcardQueryPlaceholder}
      )`);
    }

    if (fields === FuzzySearchField.ALL || fields === FuzzySearchField.SENDER) {
      countConditions.push(`(
        word_similarity(${countQueryPlaceholder}, email."fromName") > ${countThresholdPlaceholder} OR
        similarity(email."fromName", ${countQueryPlaceholder}) > ${countThresholdPlaceholder} OR
        word_similarity(${countQueryPlaceholder}, email."fromEmail") > ${countThresholdPlaceholder} OR
        similarity(email."fromEmail", ${countQueryPlaceholder}) > ${countThresholdPlaceholder} OR
        email."fromName" ILIKE ${countWildcardQueryPlaceholder} OR
        email."fromEmail" ILIKE ${countWildcardQueryPlaceholder}
      )`);
    }

    if (fields === FuzzySearchField.ALL || fields === FuzzySearchField.BODY) {
      countConditions.push(`
        to_tsvector('english', COALESCE(email."bodyText", '') || ' ' || COALESCE(email."aiSummary", ''))
        @@ plainto_tsquery('english', ${countQueryPlaceholder})
      `);
    }

    if (countConditions.length > 0) {
      countQuery += ` AND (${countConditions.join(' OR ')})`;
    }

    interface CountResult {
      total: string;
    }
    const countResult = await this.emailRepository.query<CountResult[]>(
      countQuery,
      countParams,
    );
    const { total } = countResult[0];

    const totalResults = parseInt(total, 10);
    const totalPages = Math.ceil(totalResults / limit);

    // Transform results to DTOs
    const data: FuzzySearchResultDto[] = results.map((result) => ({
      ...this.toSummaryDto(result as unknown as Email),
      relevance: parseFloat(result.relevance),
      matches: {
        subject: parseFloat(result.subject_score),
        sender: parseFloat(result.sender_score),
        body: parseFloat(result.body_score),
      },
    }));

    this.logger.log(
      `Fuzzy search for "${q}" found ${totalResults} results (threshold: ${threshold})`,
    );

    return {
      data,
      meta: {
        query: q,
        threshold,
        totalResults,
        page,
        limit,
        totalPages,
      },
    };
  }
}
