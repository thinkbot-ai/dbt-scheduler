import { pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { TABLES } from '../tables.js';
import { createdAtColumn } from './columns.js';
import { jobRuns } from './job-runs.js';
import { schedules } from './schedules.js';

export const scheduleExecutionKeys = pgTable(
  TABLES.scheduleExecutionKeys,
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => schedules.id, { onDelete: 'cascade' }),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }).notNull(),
    jobRunId: uuid('job_run_id')
      .notNull()
      .references(() => jobRuns.id, { onDelete: 'cascade' }),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex('schedule_execution_keys_schedule_id_scheduled_for_uidx').on(
      table.scheduleId,
      table.scheduledFor,
    ),
  ],
);
