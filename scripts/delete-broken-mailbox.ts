import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'tldr_db',
  });

  await dataSource.initialize();
  
  // Delete mailbox 2 which has invalid tokens
  const result = await dataSource.query('UPDATE mailboxes SET deleted_at = NOW() WHERE id = 2 AND deleted_at IS NULL');
  console.log('Soft-deleted mailbox 2:', result);
  
  await dataSource.destroy();
}

main().catch(console.error);
