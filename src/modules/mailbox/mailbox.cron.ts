import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailService } from './email.service';
import { Mailbox } from './entities';

@Injectable()
export class MailboxCron {
  private readonly logger = new Logger(MailboxCron.name);

  constructor(
    private readonly emailService: EmailService,
    @InjectRepository(Mailbox)
    private readonly mailboxRepository: Repository<Mailbox>,
  ) {}

  /**
   * Generate embeddings for emails that don't have them
   */
  @Cron(CronExpression.EVERY_10_MINUTES, {
    name: 'generate-embeddings',
  })
  async generateEmbeddingsJob() {
    this.logger.log('Starting embedding generation job...');

    try {
      const mailboxes = await this.mailboxRepository.find({
        where: { isActive: true },
      });

      for (const mailbox of mailboxes) {
        try {
          const generated = await this.emailService.generateMissingEmbeddings(
            mailbox.userId,
            50, // Process 50 emails per mailbox per hour
          );

          this.logger.log(
            `Generated ${generated} embeddings for user ${mailbox.userId}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to generate embeddings for user ${mailbox.userId}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Embedding generation job failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
