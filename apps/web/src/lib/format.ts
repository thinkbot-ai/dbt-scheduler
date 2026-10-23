import type { JobStatus, WorkerStatus } from './types.ts';

const PRIORITY_LABELS: Record<number, string> = {
  1: 'CRITICAL',
  2: 'HIGH',
  3: 'NORMAL',
  4: 'LOW',
};

export function priorityLabel(priority: number): string {
  return PRIORITY_LABELS[priority] ?? String(priority);
}

export function formatDateTime(value: string | null | undefined): string {
  if (value === null || value === undefined || value.length === 0) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) {
    return '—';
  }
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

export function formatAgo(value: string | null | undefined, now = Date.now()): string {
  if (value === null || value === undefined) {
    return '—';
  }
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) {
    return value;
  }
  const delta = Math.max(0, now - then);
  if (delta < 15_000) {
    return 'just now';
  }
  if (delta < 60_000) {
    return `${Math.floor(delta / 1000)}s ago`;
  }
  if (delta < 3_600_000) {
    return `${Math.floor(delta / 60_000)}m ago`;
  }
  return `${Math.floor(delta / 3_600_000)}h ago`;
}

export function shortSha(sha: string | null | undefined): string {
  if (sha === null || sha === undefined || sha.length === 0) {
    return '—';
  }
  return sha.slice(0, 8);
}

export function isWorkerOnline(
  status: WorkerStatus,
  lastHeartbeat: string,
  now = Date.now(),
): boolean {
  if (status === 'STOPPED' || status === 'DEAD') {
    return false;
  }
  return now - new Date(lastHeartbeat).getTime() < 90_000;
}

export function statusTone(status: JobStatus): string {
  switch (status) {
    case 'SUCCESS':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400';
    case 'FAILED':
      return 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400';
    case 'RUNNING':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400';
    case 'QUEUED':
      return 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
    case 'CANCELLED':
    case 'SKIPPED':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400';
    case 'RETRY_WAIT':
    case 'STALE':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-400';
  }
}
