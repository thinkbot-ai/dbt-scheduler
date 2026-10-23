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

export const DBT_COMMANDS = ['debug', 'deps', 'compile', 'run', 'test', 'build'] as const;
export type DbtCommand = (typeof DBT_COMMANDS)[number];

export const PROJECT_SOURCE_MODES = ['git', 'local_directory'] as const;
export type ProjectSourceMode = (typeof PROJECT_SOURCE_MODES)[number];

export const JOB_PRIORITIES = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
} as const;

export const CRON_PRESETS = [
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily', value: '0 0 * * *' },
  { label: 'Weekly', value: '0 0 * * 0' },
  { label: 'Custom', value: 'custom' },
] as const;

export const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Kolkata',
] as const;

export interface JobRunMetrics {
  modelsAttempted: number;
  modelsSuccessful: number;
  modelsFailed: number;
  modelsSkipped: number;
  testsPassed: number;
  testsFailed: number;
  executionDurationMs?: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  repositoryUrl: string;
  branch: string;
  sourceMode: ProjectSourceMode;
  projectPath: string;
  environment: string;
  dbtVersion: string | null;
  dbtAdapterVersion: string | null;
  credentialsReference: string | null;
  enabled: boolean;
  maxConcurrentJobs: number;
  createdAt: string;
  updatedAt: string;
}

export interface Schedule {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  cronExpression: string;
  timezone: string;
  dbtCommand: DbtCommand;
  dbtArguments: string[];
  runDbtDeps: boolean;
  priority: number;
  enabled: boolean;
  concurrencyPolicy: ConcurrencyPolicy;
  maxRetries: number;
  retryDelaySeconds: number;
  pollForChanges: boolean;
  lastSeenCommitSha: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobRun {
  id: string;
  scheduleId: string;
  projectId: string;
  status: JobStatus;
  priority: number;
  attempt: number;
  maxAttempts: number;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  workerId: string | null;
  commitSha: string | null;
  repositoryUrl: string | null;
  branch: string | null;
  dbtCommand: DbtCommand;
  dbtArguments: string[];
  exitCode: number | null;
  errorMessage: string | null;
  failureClass: string | null;
  durationMs: number | null;
  cancelRequestedAt: string | null;
  triggerType: 'SCHEDULED' | 'MANUAL' | 'GIT_CHANGE';
  scheduledFor: string | null;
  metrics: JobRunMetrics | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobLog {
  id: string;
  jobRunId: string;
  stream: 'stdout' | 'stderr' | 'system';
  message: string;
  sequenceNumber: number;
  timestamp: string;
}

export interface Worker {
  id: string;
  workerName: string;
  hostname: string;
  status: WorkerStatus;
  currentJobId: string | null;
  concurrency: number;
  lastHeartbeat: string;
  startedAt: string;
  createdAt: string;
}

export interface SystemStatus {
  status: 'ok';
  maxConcurrentJobs: number;
  jobs: Record<JobStatus, number>;
  workers: { total: number; running: number; idle: number };
}

export interface EnqueueResult {
  outcome: 'QUEUED' | 'SKIPPED';
  job?: JobRun;
  reason?: string;
  existingJobId?: string;
}

export interface HealthStatus {
  status: string;
  service: string;
  role: string;
  timestamp: string;
}
