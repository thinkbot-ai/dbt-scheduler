import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './packages/database/src/schema/index.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler',
  },
  verbose: true,
  strict: true,
});
