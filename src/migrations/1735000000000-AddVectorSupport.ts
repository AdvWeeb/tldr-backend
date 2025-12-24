import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVectorSupport1735000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pgvector extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // Drop the embedding column if it exists with wrong type (text)
    // This can happen if TypeORM synchronize mode created it first
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'emails' 
          AND column_name = 'embedding'
          AND data_type != 'USER-DEFINED'
        ) THEN
          ALTER TABLE "emails" DROP COLUMN "embedding";
        END IF;
      END $$;
    `);

    // Add embedding column (768 dimensions for Gemini text-embedding-004)
    await queryRunner.query(`
      ALTER TABLE "emails" 
      ADD COLUMN IF NOT EXISTS "embedding" vector(768),
      ADD COLUMN IF NOT EXISTS "embeddingGeneratedAt" TIMESTAMP
    `);

    // Create IVFFLAT index for faster similarity search
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emails_embedding_cosine" 
      ON "emails" 
      USING ivfflat ("embedding" vector_cosine_ops)
      WITH (lists = 100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_emails_embedding_cosine"`,
    );
    await queryRunner.query(
      `ALTER TABLE "emails" DROP COLUMN IF EXISTS "embedding"`,
    );
    await queryRunner.query(
      `ALTER TABLE "emails" DROP COLUMN IF EXISTS "embeddingGeneratedAt"`,
    );
  }
}
