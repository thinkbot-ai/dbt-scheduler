import { JOB_PRIORITIES } from '@dbt-scheduler/types';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { TABLES } from '../tables.js';
import { createdAtColumn, updatedAtColumn } from './columns.js';
import { concurrencyPolicyEnum, dbtCommandEnum } from './enums.js';
import { projects } from './projects.js';

export const schedules = pgTable(
  TABLES.schedules,
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    cronExpression: text('cron_expression').notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    dbtCommand: dbtCommandEnum('dbt_command').notNull().default('build'),
    dbtArguments: jsonb('dbt_arguments').$type<string[]>().notNull().default([]),
    runDbtDeps: boolean('run_dbt_deps').notNull().default(true),
    priority: integer('priority').notNull().default(JOB_PRIORITIES.NORMAL),
    enabled: boolean('enabled').notNull().default(true),
    concurrencyPolicy: concurrencyPolicyEnum('concurrency_policy')
      .notNull()
      .default('SKIP_IF_RUNNING'),
    maxRetries: integer('max_retries').notNull().default(0),
    retryDelaySeconds: integer('retry_delay_seconds').notNull().default(60),
    pollForChanges: boolean('poll_for_changes').notNull().default(false),
    lastSeenCommitSha: text('last_seen_commit_sha'),
    nextRunAt: timestamp('next_run_at', { withTimezone: true, mode: 'date' }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex('schedules_project_id_name_uidx').on(table.projectId, table.name),
    index('schedules_enabled_next_run_at_idx').on(table.enabled, table.nextRunAt),
  ],
);
