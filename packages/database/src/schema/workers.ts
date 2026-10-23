import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { TABLES } from '../tables.js';
import { createdAtColumn } from './columns.js';
import { workerStatusEnum } from './enums.js';

export const workers = pgTable(TABLES.workers, {
  id: uuid('id').primaryKey().defaultRandom(),
  workerName: text('worker_name').notNull().unique(),
  hostname: text('hostname').notNull(),
  status: workerStatusEnum('status').notNull().default('STARTING'),
  currentJobId: uuid('current_job_id'),
  concurrency: integer('concurrency').notNull().default(2),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  createdAt: createdAtColumn,
});
