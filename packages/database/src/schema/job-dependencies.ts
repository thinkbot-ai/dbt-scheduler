import { pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { TABLES } from '../tables.js';
import { createdAtColumn } from './columns.js';
import { jobRuns } from './job-runs.js';

export const jobDependencies = pgTable(
  TABLES.jobDependencies,
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobRunId: uuid('job_run_id')
      .notNull()
      .references(() => jobRuns.id, { onDelete: 'cascade' }),
    dependsOnJobRunId: uuid('depends_on_job_run_id')
      .notNull()
      .references(() => jobRuns.id, { onDelete: 'cascade' }),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex('job_dependencies_job_run_depends_on_uidx').on(
      table.jobRunId,
      table.dependsOnJobRunId,
    ),
  ],
);
