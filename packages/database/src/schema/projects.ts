import { boolean, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { TABLES } from '../tables.js';
import { createdAtColumn, updatedAtColumn } from './columns.js';
import { projectSourceModeEnum } from './enums.js';

export const projects = pgTable(
  TABLES.projects,
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    repositoryUrl: text('repository_url').notNull(),
    branch: text('branch').notNull().default('main'),
    sourceMode: projectSourceModeEnum('source_mode').notNull().default('git'),
    projectPath: text('project_path').notNull().default('.'),
    environment: text('environment').notNull().default('prod'),
    dbtVersion: text('dbt_version'),
    dbtAdapterVersion: text('dbt_adapter_version'),
    credentialsReference: text('credentials_reference'),
    enabled: boolean('enabled').notNull().default(true),
    maxConcurrentJobs: integer('max_concurrent_jobs').notNull().default(5),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex('projects_name_uidx').on(table.name)],
);
