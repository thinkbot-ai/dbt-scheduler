export const JOB_STATUSES = [
  'QUEUED',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'RETRY_WAIT',
  'STALE',
  'SKIPPED',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const WORKER_STATUSES = [
  'STARTING',
  'IDLE',
  'RUNNING',
  'DRAINING',
  'STOPPED',
  'DEAD',
] as const;

export type WorkerStatus = (typeof WORKER_STATUSES)[number];

export const CONCURRENCY_POLICIES = ['SKIP_IF_RUNNING', 'QUEUE', 'ALLOW'] as const;

export type ConcurrencyPolicy = (typeof CONCURRENCY_POLICIES)[number];

export const JOB_PRIORITIES = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
} as const;

export type JobPriorityName = keyof typeof JOB_PRIORITIES;
export type JobPriority = (typeof JOB_PRIORITIES)[JobPriorityName];

export const PROCESS_ROLES = ['api', 'scheduler', 'worker'] as const;

export type ProcessRole = (typeof PROCESS_ROLES)[number];

export const DBT_COMMANDS = ['debug', 'deps', 'compile', 'run', 'test', 'build'] as const;

export type DbtCommand = (typeof DBT_COMMANDS)[number];

export const FAILURE_CLASSES = [
  'TRANSIENT_FAILURE',
  'CONFIGURATION_FAILURE',
  'DBT_FAILURE',
  'WORKER_FAILURE',
  'CANCELLED',
] as const;

export type FailureClass = (typeof FAILURE_CLASSES)[number];

export const LOG_STREAMS = ['stdout', 'stderr', 'system'] as const;

export type LogStream = (typeof LOG_STREAMS)[number];

export const JOB_TRIGGER_TYPES = ['SCHEDULED', 'MANUAL', 'GIT_CHANGE'] as const;

export type JobTriggerType = (typeof JOB_TRIGGER_TYPES)[number];

export const PROJECT_SOURCE_MODES = ['git', 'local_directory'] as const;

export type ProjectSourceMode = (typeof PROJECT_SOURCE_MODES)[number];

export interface JobRunMetrics {
  modelsAttempted: number;
  modelsSuccessful: number;
  modelsFailed: number;
  modelsSkipped: number;
  testsPassed: number;
  testsFailed: number;
  executionDurationMs?: number;
}
