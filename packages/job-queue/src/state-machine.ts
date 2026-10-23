import { JOB_PRIORITIES, JOB_STATUSES, QueueError, type JobStatus } from '@dbt-scheduler/types';

export const QUEUE_ORDER = ['priority ASC', 'queued_at ASC'] as const;

export const CLAIMABLE_STATUSES: readonly JobStatus[] = ['QUEUED'];

export const JOB_STATE_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  QUEUED: ['RUNNING', 'CANCELLED', 'SKIPPED'],
  RUNNING: ['SUCCESS', 'FAILED', 'CANCELLED', 'STALE'],
  FAILED: ['RETRY_WAIT'],
  RETRY_WAIT: ['QUEUED', 'CANCELLED'],
  STALE: ['QUEUED', 'FAILED', 'CANCELLED'],
  SUCCESS: [],
  CANCELLED: [],
  SKIPPED: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_STATE_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new QueueError(`Invalid job transition ${from} -> ${to}`, { details: { from, to } });
  }
}

export function compareQueueOrder(
  left: { priority: number; queuedAt: Date },
  right: { priority: number; queuedAt: Date },
): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }
  return left.queuedAt.getTime() - right.queuedAt.getTime();
}

export function defaultPriority(): number {
  return JOB_PRIORITIES.NORMAL;
}

export const CLAIM_JOB_SQL = `
SELECT id
FROM job_runs
WHERE status = 'QUEUED'
ORDER BY priority ASC, queued_at ASC, id ASC
FOR UPDATE SKIP LOCKED
LIMIT 1
`.trim();

export function isTerminalStatus(status: JobStatus): boolean {
  return JOB_STATE_TRANSITIONS[status].length === 0;
}

export { JOB_STATUSES };
