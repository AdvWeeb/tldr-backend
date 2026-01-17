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
  MailboxStatsDto,
  PaginatedEmailsDto,
  SemanticSearchDto,
  SemanticSearchResponseDto,
  SemanticSearchResultDto,
  SendEmailDto,
  SummarizeEmailResponseDto,
  UpdateEmailDto,
} from './dto';
import { ColumnConfig, Email, Mailbox } from './entities';
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
    @InjectRepository(ColumnConfig)
    private readonly columnConfigRepository: Repository<ColumnConfig>,
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
      qb.andWhere(':label = ANY(string_to_array(email.labels, \',\'))', {
        label: query.label,
      });
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

  async getMailboxStats(
    userId: number,
    mailboxId: number,
  ): Promise<MailboxStatsDto> {
    const userMailboxIds = await this.getUserMailboxIds(userId);
    if (!userMailboxIds.includes(mailboxId)) {
      throw new NotFoundException(`Mailbox ${mailboxId} not found`);
    }

    const stats = await this.emailRepository
      .createQueryBuilder('email')
      .select(
        "COUNT(*) FILTER (WHERE 'INBOX' = ANY(string_to_array(email.labels, ',')))",
        'inboxTotal',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE 'INBOX' = ANY(string_to_array(email.labels, ',')) AND email.isRead = false)",
        'inboxUnread',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE email.isStarred = true)',
        'starredTotal',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE email.isStarred = true AND email.isRead = false)',
        'starredUnread',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE 'DRAFT' = ANY(string_to_array(email.labels, ',')))",
        'draftsTotal',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE 'SENT' = ANY(string_to_array(email.labels, ',')))",
        'sentTotal',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE 'SPAM' = ANY(string_to_array(email.labels, ',')))",
        'spamTotal',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE 'SPAM' = ANY(string_to_array(email.labels, ',')) AND email.isRead = false)",
        'spamUnread',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE 'TRASH' = ANY(string_to_array(email.labels, ',')))",
        'trashTotal',
      )
      .where('email.mailboxId = :mailboxId', { mailboxId })
      .andWhere('email.deletedAt IS NULL')
      .getRawOne();

    return {
      inbox: {
        total: Number(stats.inboxTotal) || 0,
        unread: Number(stats.inboxUnread) || 0,
      },
      starred: {
        total: Number(stats.starredTotal) || 0,
        unread: Number(stats.starredUnread) || 0,
      },
      drafts: {
        total: Number(stats.draftsTotal) || 0,
        unread: 0,
      },
      sent: {
        total: Number(stats.sentTotal) || 0,
        unread: 0,
      },
      spam: {
        total: Number(stats.spamTotal) || 0,
        unread: Number(stats.spamUnread) || 0,
      },
      trash: {
        total: Number(stats.trashTotal) || 0,
        unread: 0,
      },
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

  /**
   * Semantic search using vector similarity
   * Finds emails by conceptual relevance, not just keyword matching
   */
  async semanticSearch(
    userId: number,
    searchDto: SemanticSearchDto,
  ): Promise<SemanticSearchResponseDto> {
    const {
      q,
      mailboxId,
      page = 1,
      limit = 20,
      minSimilarity = 0.5, // Cosine similarity threshold (0-1, lowered for better recall)
    } = searchDto;

    const userMailboxIds = await this.getUserMailboxIds(userId);

    if (userMailboxIds.length === 0 || !q.trim()) {
      return {
        data: [],
        meta: {
          query: q,
          minSimilarity,
          totalResults: 0,
          page,
          limit,
          totalPages: 0,
        },
      };
    }

    // Generate embedding for search query
    const queryContent = this.aiService.prepareEmailContentForEmbedding({
      subject: q,
      bodyText: q,
    });
    const queryEmbedding = await this.aiService.generateEmbedding(queryContent);

    // Convert embedding array to PostgreSQL vector string
    const vectorString = `[${queryEmbedding.join(',')}]`;

    const skip = (page - 1) * limit;

    // Build semantic search query using cosine similarity
    const query = `
      SELECT 
        email.*,
        1 - (email.embedding <=> $1::vector) as similarity
      FROM emails email
      WHERE email."mailboxId" = ANY($2)
        AND email."deletedAt" IS NULL
        AND email.embedding IS NOT NULL
        ${mailboxId ? 'AND email."mailboxId" = $3' : ''}
        AND (1 - (email.embedding <=> $1::vector)) >= $${mailboxId ? 4 : 3}
      ORDER BY similarity DESC
      LIMIT $${mailboxId ? 5 : 4} 
      OFFSET $${mailboxId ? 6 : 5}
    `;

    const params: any[] = [
      vectorString,
      userMailboxIds,
      ...(mailboxId ? [mailboxId] : []),
      minSimilarity,
      limit,
      skip,
    ];

    type EmailSearchResult = Email & { similarity: string };

    // Truyền kiểu vào hàm query
    const results = await this.emailRepository.query<EmailSearchResult[]>(
      query,
      params,
    );

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM emails email
      WHERE email."mailboxId" = ANY($1)
        AND email."deletedAt" IS NULL
        AND email.embedding IS NOT NULL
        ${mailboxId ? 'AND email."mailboxId" = $2' : ''}
        AND (1 - (email.embedding <=> $3::vector)) >= $${mailboxId ? 4 : 3}
    `;

    const countParams: (number[] | number | string)[] = [
      userMailboxIds,
      ...(mailboxId ? [mailboxId] : []),
      vectorString,
      minSimilarity,
    ];

    interface CountResult {
      total: string;
    }
    const countResult = await this.emailRepository.query<CountResult[]>(
      countQuery,
      countParams,
    );

    const totalResults = parseInt(countResult[0].total, 10);
    const totalPages = Math.ceil(totalResults / limit);

    // Transform results
    const data: SemanticSearchResultDto[] = results.map((result) => ({
      ...this.toSummaryDto(result),
      similarity: parseFloat(result.similarity),
    }));

    this.logger.log(
      `Semantic search for "${q}" returned ${data.length} results (${totalResults} total)`,
    );

    return {
      data,
      meta: {
        query: q,
        minSimilarity,
        totalResults,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Generate and store embedding for an email
   */
  async generateEmailEmbedding(emailId: number): Promise<void> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId },
    });

    if (!email) {
      throw new NotFoundException(`Email ${emailId} not found`);
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
  }

  /**
   * Batch generate embeddings for emails without them
   */
  async generateMissingEmbeddings(
    userId: number,
    limit: number = 50,
  ): Promise<number> {
    const userMailboxIds = await this.getUserMailboxIds(userId);

    if (userMailboxIds.length === 0) {
      return 0;
    }

    // Use raw SQL for embedding column since it's not managed by TypeORM's @Column decorator
    const emails = await this.emailRepository
      .createQueryBuilder('email')
      .where('email.mailboxId IN (:...mailboxIds)', {
        mailboxIds: userMailboxIds,
      })
      .andWhere('email.embedding IS NULL')
      .andWhere('email.deletedAt IS NULL')
      .orderBy('email.receivedAt', 'DESC')
      .limit(limit)
      .getMany();

    let count = 0;
    for (const email of emails) {
      try {
        await this.generateEmailEmbedding(email.id);
        count++;
      } catch (error) {
        this.logger.error(
          `Failed to generate embedding for email ${email.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(`Generated ${count}/${emails.length} embeddings`);
    return count;
  }

  /**
   * Move an email to a Kanban column and sync Gmail labels
   */
  async moveEmailToColumn(
    userId: number,
    emailId: number,
    columnId: number,
    archiveFromInbox: boolean,
  ): Promise<void> {
    // Verify user owns the email
    const email = await this.findOne(userId, emailId);

    if (!email) {
      throw new NotFoundException(`Email ${emailId} not found`);
    }

    // Verify column exists and belongs to user
    const column = await this.columnConfigRepository.findOne({
      where: { id: columnId, userId },
    });

    if (!column) {
      throw new NotFoundException(`Column ${columnId} not found`);
    }

    // Get the mailbox
    const mailbox = await this.mailboxRepository.findOne({
      where: { id: email.mailboxId, userId },
    });

    if (!mailbox) {
      throw new NotFoundException(`Mailbox not found`);
    }

    // Prepare label changes
    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];

    // Add the column's Gmail label if specified
    if (column.gmailLabelId) {
      addLabelIds.push(column.gmailLabelId);
    }

    // Optionally remove INBOX label to archive
    if (archiveFromInbox) {
      removeLabelIds.push('INBOX');
    }

    // Sync with Gmail if there are label changes
    if (addLabelIds.length > 0 || removeLabelIds.length > 0) {
      try {
        await this.gmailService.modifyMessageLabels(
          mailbox,
          email.gmailMessageId,
          {
            addLabelIds,
            removeLabelIds,
          },
        );

        this.logger.log(
          `Moved email ${emailId} to column "${column.title}" and synced Gmail labels`,
        );

        // Update local email entity to reflect label changes immediately
        const currentLabels = email.labels || [];
        const updatedLabels = [
          ...new Set([
            ...currentLabels.filter((l) => !removeLabelIds.includes(l)),
            ...addLabelIds,
          ]),
        ];

        await this.emailRepository.update(email.id, {
          labels: updatedLabels,
          isStarred: updatedLabels.includes('STARRED'),
          isRead: !updatedLabels.includes('UNREAD'),
        });
      } catch (error) {
        this.logger.error(
          `Failed to sync Gmail labels for email ${emailId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw new Error('Failed to synchronize with Gmail');
      }
    }
  }

  /**
   * Get search suggestions for auto-complete
   * Returns frequent contacts, keywords from subjects, and recent searches
   */
  async getSearchSuggestions(
    userId: number,
    query: string,
  ): Promise<{
    contacts: string[];
    keywords: string[];
    recentSearches: string[];
  }> {
    const userMailboxIds = await this.getUserMailboxIds(userId);

    if (userMailboxIds.length === 0) {
      return { contacts: [], keywords: [], recentSearches: [] };
    }

    const searchPattern = query ? `%${query.toLowerCase()}%` : '%';

    // Get top contacts (from emails)
    const contactsQuery = `
      SELECT DISTINCT
        COALESCE(NULLIF("fromName", ''), "fromEmail") as contact
      FROM emails
      WHERE "mailboxId" = ANY($1)
        AND "deletedAt" IS NULL
        AND (
          LOWER("fromName") LIKE $2 
          OR LOWER("fromEmail") LIKE $2
        )
      ORDER BY contact
      LIMIT 10
    `;

    interface ContactResult {
      contact: string;
    }
    const contacts = await this.emailRepository.query<ContactResult[]>(
      contactsQuery,
      [userMailboxIds, searchPattern],
    );

    // Get top keywords (from subjects)
    const keywordsQuery = `
      SELECT keyword, COUNT(*) as frequency
      FROM (
        SELECT LOWER(regexp_split_to_table(subject, E'\\\\s+')) as keyword
        FROM emails
        WHERE "mailboxId" = ANY($1)
          AND "deletedAt" IS NULL
          AND subject IS NOT NULL
      ) s
      WHERE LENGTH(keyword) > 3
        AND keyword LIKE $2
      GROUP BY keyword
      ORDER BY frequency DESC
      LIMIT 10
    `;

    interface KeywordResult {
      keyword: string;
    }
    const keywords = await this.emailRepository.query<KeywordResult[]>(
      keywordsQuery,
      [userMailboxIds, searchPattern],
    );

    return {
      contacts: contacts
        .map((c) => c.contact)
        .filter((contact): contact is string => Boolean(contact)),
      keywords: keywords
        .map((k) => k.keyword)
        .filter((keyword): keyword is string => Boolean(keyword)),
      recentSearches: [], // Could be implemented with a search history table
    };
  }
}
