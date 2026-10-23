import type { JobRunMetrics } from '@dbt-scheduler/types';
import {
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
import { dbtCommandEnum, failureClassEnum, jobStatusEnum, jobTriggerTypeEnum } from './enums.js';
import { projects } from './projects.js';
import { schedules } from './schedules.js';

export const jobRuns = pgTable(
  TABLES.jobRuns,
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => schedules.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    status: jobStatusEnum('status').notNull().default('QUEUED'),
    priority: integer('priority').notNull(),
    attempt: integer('attempt').notNull().default(1),
    maxAttempts: integer('max_attempts').notNull().default(1),
    queuedAt: timestamp('queued_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
    workerId: uuid('worker_id'),
    commitSha: text('commit_sha'),
    repositoryUrl: text('repository_url'),
    branch: text('branch'),
    dbtCommand: dbtCommandEnum('dbt_command').notNull(),
    dbtArguments: jsonb('dbt_arguments').$type<string[]>().notNull().default([]),
    exitCode: integer('exit_code'),
    errorMessage: text('error_message'),
    failureClass: failureClassEnum('failure_class'),
    durationMs: integer('duration_ms'),
    cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true, mode: 'date' }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true, mode: 'date' }),
    triggerType: jobTriggerTypeEnum('trigger_type').notNull().default('SCHEDULED'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }),
    idempotencyKey: text('idempotency_key'),
    metrics: jsonb('metrics').$type<JobRunMetrics>(),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index('job_runs_status_priority_queued_at_idx').on(
      table.status,
      table.priority,
      table.queuedAt,
    ),
    index('job_runs_schedule_id_status_idx').on(table.scheduleId, table.status),
    index('job_runs_project_id_status_idx').on(table.projectId, table.status),
    uniqueIndex('job_runs_schedule_id_idempotency_key_uidx').on(
      table.scheduleId,
      table.idempotencyKey,
    ),
  ],
);
