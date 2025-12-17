import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePgTrgmExtension1734220800000 implements MigrationInterface {
  name = 'EnablePgTrgmExtension1734220800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pg_trgm extension for fuzzy search
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // Create trigram indexes for fuzzy matching on subject and sender fields
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_subject_trgm" ON "emails" USING GIN ("subject" gin_trgm_ops)`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_fromName_trgm" ON "emails" USING GIN ("fromName" gin_trgm_ops)`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_fromEmail_trgm" ON "emails" USING GIN ("fromEmail" gin_trgm_ops)`,
    );

    // Create full-text search indexes for body and summary
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_bodyText_fts" ON "emails" USING GIN (to_tsvector('english', COALESCE("bodyText", '')))`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_aiSummary_fts" ON "emails" USING GIN (to_tsvector('english', COALESCE("aiSummary", '')))`,
    );

    // Set minimum similarity threshold (can be adjusted per query)
    await queryRunner.query(`SELECT set_limit(0.3)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_emails_aiSummary_fts"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_emails_bodyText_fts"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_emails_fromEmail_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_emails_fromName_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_emails_subject_trgm"`);

    // Note: We don't drop the extension as it might be used elsewhere
    // await queryRunner.query(`DROP EXTENSION IF EXISTS pg_trgm`);
  }
}
