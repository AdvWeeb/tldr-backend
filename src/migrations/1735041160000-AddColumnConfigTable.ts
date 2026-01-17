import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddColumnConfigTable1735041160000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create column_configs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "column_configs" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        "title" VARCHAR(100) NOT NULL,
        "orderIndex" INTEGER NOT NULL DEFAULT 0,
        "gmailLabelId" VARCHAR(100),
        "color" VARCHAR(20) NOT NULL DEFAULT '#6B7280',
        "isDefault" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // Create index for efficient querying by user and order
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_column_configs_userId_orderIndex" 
      ON "column_configs" ("userId", "orderIndex")
    `);

    // Add foreign key to users table
    // Check if constraint exists before adding
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_column_configs_userId') THEN
          ALTER TABLE "column_configs"
          ADD CONSTRAINT "FK_column_configs_userId"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE CASCADE;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "column_configs"`);
  }
}
