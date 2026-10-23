import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Database } from './client.js';
import { migrationsFolder } from './migrate.js';
import * as schema from './schema/index.js';

export interface TestDatabase {
  db: Database;
  close: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: migrationsFolder() });
  return {
    db: db as unknown as Database,
    async close() {
      await client.close();
    },
  };
}
