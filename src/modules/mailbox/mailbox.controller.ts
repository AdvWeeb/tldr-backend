import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import { User } from '../user/entities/user.entity';
import {
  ConnectMailboxDto,
  GmailLabelsResponseDto,
  MailboxResponseDto,
  MailboxStatsDto,
} from './dto';
import { EmailService } from './email.service';
import { MailboxService } from './mailbox.service';

@ApiTags('Mailboxes')
@ApiBearerAuth()
@Controller('mailboxes')
export class MailboxController {
  constructor(
    private readonly mailboxService: MailboxService,
    private readonly emailService: EmailService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all user mailboxes' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of user mailboxes',
    type: [MailboxResponseDto],
  })
  async findAll(@CurrentUser() user: User): Promise<MailboxResponseDto[]> {
    const mailboxes = await this.mailboxService.findAllByUser(user.id);
    return mailboxes.map((mailbox) => this.toResponseDto(mailbox));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get mailbox by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Mailbox details',
    type: MailboxResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Mailbox not found',
  })
  async findOne(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MailboxResponseDto> {
    const mailbox = await this.mailboxService.findOneByUser(user.id, id);
    return this.toResponseDto(mailbox);
  }

  @Post('connect')
  @ApiOperation({ summary: 'Connect a Gmail mailbox using OAuth code' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Mailbox connected successfully',
    type: MailboxResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Mailbox already connected',
  })
  async connect(
    @CurrentUser() user: User,
    @Body() connectDto: ConnectMailboxDto,
  ): Promise<MailboxResponseDto> {
    const mailbox = await this.mailboxService.connectGmailMailbox(
      user.id,
      connectDto,
    );
    return this.toResponseDto(mailbox);
  }

  @Post(':id/sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Trigger mailbox synchronization' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Sync started',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Mailbox not found',
  })
  async sync(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string }> {
    await this.mailboxService.syncMailbox(user.id, id);
    return { message: 'Sync initiated' };
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get mailbox email counts by category' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Mailbox statistics',
    type: MailboxStatsDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Mailbox not found',
  })
  async getStats(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MailboxStatsDto> {
    return this.emailService.getMailboxStats(user.id, id);
  }

  @Get(':id/labels')
  @ApiOperation({ summary: 'Get Gmail labels for a mailbox' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Gmail labels',
    type: GmailLabelsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Mailbox not found',
  })
  async getLabels(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<GmailLabelsResponseDto> {
    return this.mailboxService.getGmailLabels(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect a mailbox' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Mailbox disconnected',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Mailbox not found',
  })
  async disconnect(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.mailboxService.disconnectMailbox(user.id, id);
  }

  private toResponseDto(
    mailbox: import('./entities').Mailbox,
  ): MailboxResponseDto {
    return {
      id: mailbox.id,
      email: mailbox.email,
      provider: mailbox.provider,
      syncStatus: mailbox.syncStatus,
      lastSyncAt: mailbox.lastSyncAt,
      totalEmails: mailbox.totalEmails,
      unreadCount: mailbox.unreadCount,
      isActive: mailbox.isActive,
      createdAt: mailbox.createdAt,
    };
  }
}
