import { DatabaseError } from '@dbt-scheduler/types';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresDatabase } from './client.js';
import { wrapDatabaseError } from './errors.js';

export function migrationsFolder(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../db/migrations');
}

export async function migratePostgresDatabase(connectionString: string): Promise<void> {
  const database = createPostgresDatabase(connectionString, { max: 1 });
  try {
    await migratePostgres(database.db, { migrationsFolder: migrationsFolder() });
  } catch (error) {
    throw wrapDatabaseError(error, 'Failed to apply PostgreSQL migrations');
  } finally {
    await database.close();
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.length === 0) {
    throw new DatabaseError('DATABASE_URL is required to run migrations');
  }
  await migratePostgresDatabase(connectionString);
}

const isCli = process.argv[1] !== undefined && path.resolve(process.argv[1]).includes('migrate');
if (isCli) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
