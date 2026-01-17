import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsSnoozedToEmails1733788800000 implements MigrationInterface {
  name = 'AddIsSnoozedToEmails1733788800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "isSnoozed" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_isSnoozed_snoozedUntil" ON "emails" ("isSnoozed", "snoozedUntil")`,
    );

    await queryRunner.query(
      `UPDATE "emails" SET "isSnoozed" = true WHERE "snoozedUntil" IS NOT NULL AND "snoozedUntil" > NOW()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_emails_isSnoozed_snoozedUntil"`);

    await queryRunner.query(`ALTER TABLE "emails" DROP COLUMN "isSnoozed"`);
  }
}
