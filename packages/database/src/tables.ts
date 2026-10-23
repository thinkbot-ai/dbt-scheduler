export const TABLES = {
  projects: 'projects',
  schedules: 'schedules',
  jobRuns: 'job_runs',
  jobLogs: 'job_logs',
  workers: 'workers',
  jobDependencies: 'job_dependencies',
  scheduleExecutionKeys: 'schedule_execution_keys',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];
