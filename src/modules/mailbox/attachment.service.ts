import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attachment, Email, Mailbox } from './entities';
import { GmailService } from './providers/gmail.service';

export interface AttachmentDownload {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name);

  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(Mailbox)
    private readonly mailboxRepository: Repository<Mailbox>,
    private readonly gmailService: GmailService,
  ) {}

  async findOne(userId: number, attachmentId: number): Promise<Attachment> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id: attachmentId },
      relations: ['email', 'email.mailbox'],
    });

    if (!attachment) {
      throw new NotFoundException(
        `Attachment with ID ${attachmentId} not found`,
      );
    }

    if (attachment.email.mailbox.userId !== userId) {
      throw new NotFoundException(
        `Attachment with ID ${attachmentId} not found`,
      );
    }

    return attachment;
  }

  async download(
    userId: number,
    attachmentId: number,
  ): Promise<AttachmentDownload> {
    const attachment = await this.findOne(userId, attachmentId);

    const email = await this.emailRepository.findOne({
      where: { id: attachment.emailId },
    });

    if (!email) {
      throw new NotFoundException('Email not found for attachment');
    }

    const mailbox = await this.mailboxRepository.findOne({
      where: { id: email.mailboxId },
    });

    if (!mailbox) {
      throw new NotFoundException('Mailbox not found for attachment');
    }

    this.logger.log(
      `Downloading attachment ${attachmentId} from Gmail for user ${userId}`,
    );

    const buffer = await this.gmailService.getAttachment(
      mailbox,
      email.gmailMessageId,
      attachment.gmailAttachmentId,
    );

    return {
      buffer,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: Number(attachment.size),
    };
  }

  async findByEmail(userId: number, emailId: number): Promise<Attachment[]> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId },
      relations: ['mailbox'],
    });

    if (!email || email.mailbox.userId !== userId) {
      throw new NotFoundException(`Email with ID ${emailId} not found`);
    }

    return this.attachmentRepository.find({
      where: { emailId },
      order: { id: 'ASC' },
    });
  }
}
