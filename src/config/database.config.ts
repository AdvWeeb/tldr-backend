import { registerAs } from '@nestjs/config';

export default registerAs('database', function () {
  return {
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number.parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    synchronize: process.env.DATABASE_SYNC === 'true',
    autoLoadEntities: process.env.DATABASE_AUTOLOAD === 'true',
    logging: false, // Disable SQL logging
    entities: ['dist/**/*.entity{.ts,.js}'],
    migrations: ['dist/src/migrations/*{.ts,.js}'],
    migrationsRun: true,
  };
});
