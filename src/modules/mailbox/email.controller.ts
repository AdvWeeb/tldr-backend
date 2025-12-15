import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators';
import { User } from '../user/entities/user.entity';
import {
  AttachmentSummaryDto,
  EmailDetailDto,
  EmailQueryDto,
  FuzzySearchDto,
  FuzzySearchResponseDto,
  PaginatedEmailsDto,
  SendEmailDto,
  SummarizeEmailResponseDto,
  UpdateEmailDto,
} from './dto';
import { EmailService } from './email.service';

@ApiTags('Emails')
@ApiBearerAuth()
@Controller('emails')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Get()
  @ApiOperation({
    summary: 'Query or list emails with pagination and filtering',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated list of emails',
    type: PaginatedEmailsDto,
  })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: EmailQueryDto,
    @Req() request: Request,
  ): Promise<PaginatedEmailsDto> {
    const baseUrl = `${request.protocol}://${request.get('host')}${request.path}`;
    return this.emailService.findAll(user.id, query, baseUrl);
  }

  @Get('search/fuzzy')
  @ApiOperation({
    summary: 'Fuzzy search emails with typo tolerance and partial matching',
    description:
      'Search emails using PostgreSQL pg_trgm for similarity matching. ' +
      'Supports typos (e.g., "markting" finds "marketing") and partial matches ' +
      '(e.g., "Nguy" finds "Nguyễn"). Returns results ranked by relevance.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Fuzzy search results with relevance scores',
    type: FuzzySearchResponseDto,
  })
  async fuzzySearch(
    @CurrentUser() user: User,
    @Query() searchDto: FuzzySearchDto,
  ): Promise<FuzzySearchResponseDto> {
    return this.emailService.fuzzySearch(user.id, searchDto);
  }

  @Post('send')
  @ApiOperation({ summary: 'Send an email via Gmail API' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Email sent successfully',
    schema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Gmail message ID' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Mailbox not found',
  })
  async sendEmail(
    @CurrentUser() user: User,
    @Body() sendDto: SendEmailDto,
  ): Promise<{ messageId: string }> {
    return this.emailService.sendEmail(user.id, sendDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single email with full details' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Email details',
    type: EmailDetailDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Email not found',
  })
  async findOne(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EmailDetailDto> {
    const email = await this.emailService.findOne(user.id, id);
    return this.toDetailDto(email);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update email properties (read status, task status, etc.)',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Email updated',
    type: EmailDetailDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Email not found',
  })
  async update(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateEmailDto,
  ): Promise<EmailDetailDto> {
    const email = await this.emailService.update(user.id, id, updateDto);
    return this.toDetailDto(email);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an email' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Email deleted',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Email not found',
  })
  async remove(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.emailService.softDelete(user.id, id);
  }

  @Post(':id/summarize')
  @ApiOperation({ summary: 'Generate AI summary for an email' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Email summary generated',
    type: SummarizeEmailResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Email not found',
  })
  async summarize(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SummarizeEmailResponseDto> {
    return this.emailService.summarizeEmail(user.id, id);
  }

  private toDetailDto(email: import('./entities').Email): EmailDetailDto {
    return {
      id: email.id,
      mailboxId: email.mailboxId,
      gmailMessageId: email.gmailMessageId,
      gmailThreadId: email.gmailThreadId,
      subject: email.subject,
      snippet: email.snippet,
      fromEmail: email.fromEmail,
      fromName: email.fromName,
      toEmails: email.toEmails,
      ccEmails: email.ccEmails,
      bodyHtml: email.bodyHtml,
      bodyText: email.bodyText,
      receivedAt: email.receivedAt,
      isRead: email.isRead,
      isStarred: email.isStarred,
      hasAttachments: email.hasAttachments,
      labels: email.labels,
      category: email.category,
      taskStatus: email.taskStatus,
      taskDeadline: email.taskDeadline,
      isPinned: email.isPinned,
      isSnoozed: email.isSnoozed,
      snoozedUntil: email.snoozedUntil,
      aiSummary: email.aiSummary,
      aiActionItems: email.aiActionItems,
      aiUrgencyScore: email.aiUrgencyScore,
      attachments: (email.attachments || []).map(
        (att): AttachmentSummaryDto => ({
          id: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          size: Number(att.size),
          isInline: att.isInline,
        }),
      ),
    };
  }
}
