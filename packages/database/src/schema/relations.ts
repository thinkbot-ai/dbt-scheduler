import { relations } from 'drizzle-orm';
import { jobDependencies } from './job-dependencies.js';
import { jobLogs } from './job-logs.js';
import { jobRuns } from './job-runs.js';
import { projects } from './projects.js';
import { scheduleExecutionKeys } from './schedule-execution-keys.js';
import { schedules } from './schedules.js';

export const projectsRelations = relations(projects, ({ many }) => ({
  schedules: many(schedules),
  jobRuns: many(jobRuns),
}));

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  project: one(projects, { fields: [schedules.projectId], references: [projects.id] }),
  jobRuns: many(jobRuns),
  executionKeys: many(scheduleExecutionKeys),
}));

export const jobRunsRelations = relations(jobRuns, ({ one, many }) => ({
  project: one(projects, { fields: [jobRuns.projectId], references: [projects.id] }),
  schedule: one(schedules, { fields: [jobRuns.scheduleId], references: [schedules.id] }),
  logs: many(jobLogs),
  dependencies: many(jobDependencies, { relationName: 'jobRunDependencies' }),
  dependents: many(jobDependencies, { relationName: 'jobRunDependents' }),
}));

export const jobLogsRelations = relations(jobLogs, ({ one }) => ({
  jobRun: one(jobRuns, { fields: [jobLogs.jobRunId], references: [jobRuns.id] }),
}));

export const jobDependenciesRelations = relations(jobDependencies, ({ one }) => ({
  jobRun: one(jobRuns, {
    fields: [jobDependencies.jobRunId],
    references: [jobRuns.id],
    relationName: 'jobRunDependencies',
  }),
  dependsOnJobRun: one(jobRuns, {
    fields: [jobDependencies.dependsOnJobRunId],
    references: [jobRuns.id],
    relationName: 'jobRunDependents',
  }),
}));

export const scheduleExecutionKeysRelations = relations(scheduleExecutionKeys, ({ one }) => ({
  schedule: one(schedules, {
    fields: [scheduleExecutionKeys.scheduleId],
    references: [schedules.id],
  }),
  jobRun: one(jobRuns, {
    fields: [scheduleExecutionKeys.jobRunId],
    references: [jobRuns.id],
  }),
}));
