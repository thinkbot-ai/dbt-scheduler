import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { wrapDatabaseError } from './errors.js';
import * as schema from './schema/index.js';

export type AppSchema = typeof schema;
export type Database = PostgresJsDatabase<AppSchema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbOrTx = Database | Transaction;

export interface PostgresDatabase {
  db: Database;
  ping: () => Promise<void>;
  close: () => Promise<void>;
}

export function createPostgresDatabase(
  connectionString: string,
  options?: { max?: number },
): PostgresDatabase {
  const sql = postgres(connectionString, {
    max: options?.max ?? 10,
  });
  const db = drizzle(sql, { schema });

  return {
    db,
    async ping() {
      try {
        await sql`select 1`;
      } catch (error) {
        throw wrapDatabaseError(error, 'Database ping failed');
      }
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

export async function withTransaction<T>(
  db: Database,
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(callback);
}
