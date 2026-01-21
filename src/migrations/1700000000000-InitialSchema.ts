import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enums
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "users_authprovider_enum" AS ENUM('local', 'google');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "mailboxes_provider_enum" AS ENUM('gmail');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "mailboxes_syncstatus_enum" AS ENUM('pending', 'syncing', 'synced', 'error');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "emails_category_enum" AS ENUM('primary', 'social', 'promotions', 'updates', 'forums');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "emails_taskstatus_enum" AS ENUM('none', 'todo', 'in_progress', 'done');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" SERIAL PRIMARY KEY,
        "email" VARCHAR(255) NOT NULL UNIQUE,
        "password" TEXT,
        "firstName" VARCHAR(255) NOT NULL,
        "lastName" VARCHAR(255) NOT NULL,
        "authProvider" "users_authprovider_enum" NOT NULL DEFAULT 'local',
        "googleId" TEXT UNIQUE,
        "avatarUrl" TEXT,
        "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_email" ON "users" ("email")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_googleId" ON "users" ("googleId")
    `);

    // Create refresh_tokens table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" INTEGER NOT NULL,
        "tokenHash" TEXT NOT NULL,
        "encryptedGoogleRefreshToken" TEXT,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "userAgent" TEXT,
        "ipAddress" TEXT,
        "isRevoked" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "FK_refresh_tokens_userId" FOREIGN KEY ("userId") 
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId")
    `);

    // Create mailboxes table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mailboxes" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        "email" VARCHAR(255) NOT NULL,
        "provider" "mailboxes_provider_enum" NOT NULL DEFAULT 'gmail',
        "encryptedAccessToken" TEXT,
        "encryptedRefreshToken" TEXT,
        "tokenExpiresAt" TIMESTAMP WITH TIME ZONE,
        "syncStatus" "mailboxes_syncstatus_enum" NOT NULL DEFAULT 'pending',
        "lastSyncAt" TIMESTAMP WITH TIME ZONE,
        "lastSyncError" TEXT,
        "historyId" TEXT,
        "totalEmails" INTEGER NOT NULL DEFAULT 0,
        "unreadCount" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "FK_mailboxes_userId" FOREIGN KEY ("userId") 
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_mailboxes_userId" ON "mailboxes" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_mailboxes_email" ON "mailboxes" ("email")
    `);

    // Create emails table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "emails" (
        "id" SERIAL PRIMARY KEY,
        "mailboxId" INTEGER NOT NULL,
        "gmailMessageId" TEXT NOT NULL,
        "gmailThreadId" TEXT NOT NULL,
        "subject" TEXT,
        "snippet" TEXT,
        "fromEmail" TEXT NOT NULL,
        "fromName" TEXT,
        "toEmails" TEXT,
        "ccEmails" TEXT,
        "bccEmails" TEXT,
        "bodyHtml" TEXT,
        "bodyText" TEXT,
        "receivedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "isRead" BOOLEAN NOT NULL DEFAULT false,
        "isStarred" BOOLEAN NOT NULL DEFAULT false,
        "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
        "labels" TEXT,
        "category" "emails_category_enum" NOT NULL DEFAULT 'primary',
        "taskStatus" "emails_taskstatus_enum" NOT NULL DEFAULT 'none',
        "taskDeadline" TIMESTAMP WITH TIME ZONE,
        "isPinned" BOOLEAN NOT NULL DEFAULT false,
        "isSnoozed" BOOLEAN NOT NULL DEFAULT false,
        "snoozedUntil" TIMESTAMP WITH TIME ZONE,
        "aiSummary" TEXT,
        "aiActionItems" JSONB,
        "aiUrgencyScore" SMALLINT,
        "embeddingGeneratedAt" TIMESTAMP,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "FK_emails_mailboxId" FOREIGN KEY ("mailboxId") 
          REFERENCES "mailboxes"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes for emails
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emails_mailboxId" ON "emails" ("mailboxId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_emails_mailboxId_gmailMessageId" 
      ON "emails" ("mailboxId", "gmailMessageId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emails_mailboxId_receivedAt" 
      ON "emails" ("mailboxId", "receivedAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emails_mailboxId_isRead" 
      ON "emails" ("mailboxId", "isRead")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emails_mailboxId_category" 
      ON "emails" ("mailboxId", "category")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emails_gmailThreadId" ON "emails" ("gmailThreadId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emails_fromEmail" ON "emails" ("fromEmail")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emails_isSnoozed_snoozedUntil" 
      ON "emails" ("isSnoozed", "snoozedUntil")
    `);

    // Create attachments table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attachments" (
        "id" SERIAL PRIMARY KEY,
        "emailId" INTEGER NOT NULL,
        "gmailAttachmentId" TEXT NOT NULL,
        "filename" TEXT NOT NULL,
        "mimeType" TEXT NOT NULL,
        "size" BIGINT NOT NULL,
        "contentId" TEXT,
        "isInline" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "FK_attachments_emailId" FOREIGN KEY ("emailId") 
          REFERENCES "emails"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_attachments_emailId" ON "attachments" ("emailId")
    `);

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
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_column_configs_userId" FOREIGN KEY ("userId") 
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_column_configs_userId_orderIndex" 
      ON "column_configs" ("userId", "orderIndex")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "column_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attachments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "emails"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mailboxes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "emails_taskstatus_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "emails_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "mailboxes_syncstatus_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "mailboxes_provider_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_authprovider_enum"`);
  }
}
