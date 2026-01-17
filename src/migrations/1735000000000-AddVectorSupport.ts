import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVectorSupport1735000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pgvector extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // Check if embedding column exists
    const embeddingColumn = await queryRunner.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns 
      WHERE table_schema = 'public'
        AND table_name = 'emails' 
        AND column_name = 'embedding'
    `);

    if (embeddingColumn.length > 0) {
      const columnType = embeddingColumn[0].udt_name;
      // If it exists but is not vector type, drop it
      if (columnType !== 'vector') {
        await queryRunner.query(
          `ALTER TABLE "emails" DROP COLUMN "embedding"`,
        );
        // Now add it with correct type
        await queryRunner.query(
          `ALTER TABLE "emails" ADD COLUMN "embedding" vector(768)`,
        );
      }
      // If it's already vector type, do nothing
    } else {
      // Column doesn't exist, create it
      await queryRunner.query(
        `ALTER TABLE "emails" ADD COLUMN "embedding" vector(768)`,
      );
    }

    // Add embeddingGeneratedAt if not exists
    await queryRunner.query(`
      ALTER TABLE "emails" 
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
