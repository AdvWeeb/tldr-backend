import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddColumnIdToEmails1737295200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columnId to emails table
    await queryRunner.query(`
      ALTER TABLE "emails"
      ADD COLUMN IF NOT EXISTS "columnId" INTEGER NULL
    `);

    // Create index for efficient querying by columnId
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emails_columnId"
      ON "emails" ("columnId")
    `);

    // Add foreign key constraint to column_configs table
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_emails_columnId') THEN
          ALTER TABLE "emails"
          ADD CONSTRAINT "FK_emails_columnId"
          FOREIGN KEY ("columnId") REFERENCES "column_configs"("id")
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Optionally migrate existing data based on taskStatus and labels
    await queryRunner.query(`
      UPDATE emails e
      SET "columnId" = (
        SELECT c.id 
        FROM column_configs c 
        WHERE c."userId" IN (
          SELECT m."userId" 
          FROM mailboxes m 
          WHERE m.id = e."mailboxId"
        )
        AND (
          (e."taskStatus" = 'done' AND LOWER(c.title) = 'done') OR
          (e."taskStatus" = 'in_progress' AND LOWER(c.title) = 'in progress') OR
          (e."taskStatus" = 'todo' AND LOWER(c.title) IN ('todo', 'to do')) OR
          (e."isStarred" = true AND c."gmailLabelId" = 'STARRED') OR
          ('IMPORTANT' = ANY(string_to_array(e.labels, ',')) AND c."gmailLabelId" = 'IMPORTANT') OR
          ('INBOX' = ANY(string_to_array(e.labels, ',')) AND c."gmailLabelId" = 'INBOX')
        )
        ORDER BY 
          CASE 
            WHEN e."taskStatus" = 'done' AND LOWER(c.title) = 'done' THEN 1
            WHEN e."taskStatus" = 'in_progress' AND LOWER(c.title) = 'in progress' THEN 2
            WHEN e."taskStatus" = 'todo' AND LOWER(c.title) IN ('todo', 'to do') THEN 3
            WHEN e."isStarred" = true AND c."gmailLabelId" = 'STARRED' THEN 4
            WHEN 'IMPORTANT' = ANY(string_to_array(e.labels, ',')) AND c."gmailLabelId" = 'IMPORTANT' THEN 5
            WHEN 'INBOX' = ANY(string_to_array(e.labels, ',')) AND c."gmailLabelId" = 'INBOX' THEN 6
            ELSE 7
          END
        LIMIT 1
      )
      WHERE "columnId" IS NULL AND "deletedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "emails"
      DROP CONSTRAINT IF EXISTS "FK_emails_columnId"
    `);

    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_emails_columnId"
    `);

    // Drop column
    await queryRunner.query(`
      ALTER TABLE "emails"
      DROP COLUMN IF EXISTS "columnId"
    `);
  }
}
