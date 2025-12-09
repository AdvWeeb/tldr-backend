import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Email } from '../entities';

@Injectable()
export class SnoozeWakeupService {
  private readonly logger = new Logger(SnoozeWakeupService.name);

  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleSnoozeWakeup(): Promise<void> {
    const now = new Date();

    const snoozedEmails = await this.emailRepository.find({
      where: {
        isSnoozed: true,
        snoozedUntil: LessThanOrEqual(now),
      },
      select: ['id'],
    });

    if (snoozedEmails.length === 0) {
      return;
    }

    const emailIds = snoozedEmails.map((e) => e.id);

    await this.emailRepository
      .createQueryBuilder()
      .update(Email)
      .set({
        isSnoozed: false,
        snoozedUntil: null,
      })
      .whereInIds(emailIds)
      .execute();

    this.logger.log(`Woke up ${emailIds.length} snoozed emails`);
  }
}
