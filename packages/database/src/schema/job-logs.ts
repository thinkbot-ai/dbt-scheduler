import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { TABLES } from '../tables.js';
import { logStreamEnum } from './enums.js';
import { jobRuns } from './job-runs.js';

export const jobLogs = pgTable(
  TABLES.jobLogs,
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobRunId: uuid('job_run_id')
      .notNull()
      .references(() => jobRuns.id, { onDelete: 'cascade' }),
    timestamp: timestamp('timestamp', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    stream: logStreamEnum('stream').notNull(),
    message: text('message').notNull(),
    sequenceNumber: integer('sequence_number').notNull(),
    externalUri: text('external_uri'),
  },
  (table) => [
    uniqueIndex('job_logs_job_run_id_sequence_uidx').on(table.jobRunId, table.sequenceNumber),
  ],
);
