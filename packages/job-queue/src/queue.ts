import type {
  ConcurrencyPolicy,
  DbtCommand,
  FailureClass,
  JobRunMetrics,
  JobTriggerType,
} from '@dbt-scheduler/types';
import { QueueError } from '@dbt-scheduler/types';
import {
  JobRunsRepository,
  ProjectsRepository,
  SchedulesRepository,
  WorkersRepository,
  withTransaction,
  type Database,
  type DbOrTx,
  type JobRun,
  type Schedule,
} from '@dbt-scheduler/database';
import { assertTransition } from './state-machine.js';

const MAX_CLAIM_CANDIDATES = 50;

export interface JobQueueOptions {
  leaseSeconds: number;
  maxConcurrentJobs?: number;
  now?: () => Date;
}

export interface EnqueueJobInput {
  scheduleId: string;
  triggerType?: JobTriggerType;
  scheduledFor?: Date | null;
  idempotencyKey?: string | null;
  priority?: number;
}

export type EnqueueJobResult =
  | { outcome: 'QUEUED'; job: JobRun }
  | { outcome: 'SKIPPED'; reason: 'SKIP_IF_RUNNING'; existingJobId: string };

export interface CompleteJobSuccessInput {
  jobId: string;
  workerId: string;
  exitCode?: number;
  commitSha?: string | null;
  repositoryUrl?: string | null;
  branch?: string | null;
  metrics?: JobRunMetrics | null;
  durationMs?: number | null;
}

export interface CompleteJobFailureInput {
  jobId: string;
  workerId: string;
  exitCode?: number | null;
  errorMessage?: string;
  failureClass?: FailureClass;
  durationMs?: number | null;
}

export interface CompleteJobCancelInput {
  jobId: string;
  workerId: string;
  errorMessage?: string;
  durationMs?: number | null;
}

export class JobQueue {
  constructor(
    private readonly db: Database,
    private readonly options: JobQueueOptions,
  ) {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  async enqueue(input: EnqueueJobInput): Promise<EnqueueJobResult> {
    return withTransaction(this.db, async (tx) => this.enqueueWith(tx, input));
  }

  async enqueueWith(tx: DbOrTx, input: EnqueueJobInput): Promise<EnqueueJobResult> {
    const schedules = new SchedulesRepository(tx);
    const jobs = new JobRunsRepository(tx);
    const schedule = await schedules.getById(input.scheduleId);
    if (!schedule) {
      throw new QueueError('Schedule not found', { details: { scheduleId: input.scheduleId } });
    }

    const policy: ConcurrencyPolicy = schedule.concurrencyPolicy;
    if (policy === 'SKIP_IF_RUNNING') {
      const existing = await jobs.findInFlightBySchedule(schedule.id);
      if (existing) {
        return {
          outcome: 'SKIPPED',
          reason: 'SKIP_IF_RUNNING',
          existingJobId: existing.id,
        };
      }
    }

    const job = await jobs.create(buildJobInsert(schedule, input));
    return { outcome: 'QUEUED', job };
  }

  async claim(workerId: string): Promise<JobRun | undefined> {
    const now = this.now();
    const leaseExpiresAt = new Date(now.getTime() + this.options.leaseSeconds * 1000);
    const maxConcurrentJobs = this.options.maxConcurrentJobs ?? 10;

    return withTransaction(this.db, async (tx) => {
      const workers = new WorkersRepository(tx);
      const jobs = new JobRunsRepository(tx);
      const projects = new ProjectsRepository(tx);
      const schedules = new SchedulesRepository(tx);
      const worker = await workers.getById(workerId);
      if (!worker) {
        throw new QueueError('Worker not found', { details: { workerId } });
      }

      await jobs.acquireClaimLock();

      const runningGlobal = await jobs.countByStatuses(['RUNNING']);
      if (runningGlobal >= maxConcurrentJobs) {
        await this.syncWorkerPresence(workers, jobs, workerId, now);
        return undefined;
      }

      const skipped: string[] = [];
      for (let attempt = 0; attempt < MAX_CLAIM_CANDIDATES; attempt += 1) {
        const locked = await jobs.lockNextQueued(skipped);
        if (!locked) {
          await this.syncWorkerPresence(workers, jobs, workerId, now);
          return undefined;
        }
        skipped.push(locked.id);

        const eligible = await this.isClaimEligible(jobs, projects, schedules, locked);
        if (!eligible) {
          continue;
        }

        const claimed = await jobs.markQueuedJobRunning({
          jobId: locked.id,
          workerId,
          now,
          leaseExpiresAt,
        });
        if (!claimed) {
          continue;
        }

        assertTransition('QUEUED', 'RUNNING');
        await workers.update(workerId, {
          status: 'RUNNING',
          currentJobId: claimed.id,
          lastHeartbeat: now,
        });
        return claimed;
      }

      await this.syncWorkerPresence(workers, jobs, workerId, now);
      return undefined;
    });
  }

  private async isClaimEligible(
    jobs: JobRunsRepository,
    projects: ProjectsRepository,
    schedules: SchedulesRepository,
    job: JobRun,
  ): Promise<boolean> {
    const project = await projects.getById(job.projectId);
    if (!project || !project.enabled) {
      return false;
    }
    // local_directory projects have no per-job workspace isolation (unlike git
    // clone mode), so at most one job may ever be RUNNING at a time regardless
    // of maxConcurrentJobs or a schedule's ALLOW concurrency policy.
    const projectCap = project.sourceMode === 'local_directory' ? 1 : project.maxConcurrentJobs;
    const projectRunning = await jobs.countByStatuses(['RUNNING'], { projectId: job.projectId });
    if (projectRunning >= projectCap) {
      return false;
    }

    const schedule = await schedules.getById(job.scheduleId);
    const policy: ConcurrencyPolicy = schedule?.concurrencyPolicy ?? 'SKIP_IF_RUNNING';
    if (policy !== 'ALLOW') {
      const scheduleRunning = await jobs.countByStatuses(['RUNNING'], {
        scheduleId: job.scheduleId,
      });
      if (scheduleRunning > 0) {
        return false;
      }
    }
    return true;
  }

  private async syncWorkerPresence(
    workers: WorkersRepository,
    jobs: JobRunsRepository,
    workerId: string,
    now: Date,
  ): Promise<void> {
    const remaining = await jobs.listByWorkerAndStatuses(workerId, ['RUNNING']);
    await workers.update(workerId, {
      status: remaining.length > 0 ? 'RUNNING' : 'IDLE',
      currentJobId: remaining[0]?.id ?? null,
      lastHeartbeat: now,
    });
  }

  async completeSuccess(input: CompleteJobSuccessInput): Promise<JobRun> {
    return this.finish(input.jobId, input.workerId, 'SUCCESS', {
      exitCode: input.exitCode ?? 0,
      ...(input.commitSha === undefined ? {} : { commitSha: input.commitSha }),
      ...(input.repositoryUrl === undefined ? {} : { repositoryUrl: input.repositoryUrl }),
      ...(input.branch === undefined ? {} : { branch: input.branch }),
      ...(input.metrics === undefined ? {} : { metrics: input.metrics }),
      ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    });
  }

  async completeFailure(input: CompleteJobFailureInput): Promise<JobRun> {
    return this.finish(input.jobId, input.workerId, 'FAILED', {
      ...(input.exitCode === undefined ? {} : { exitCode: input.exitCode }),
      errorMessage: input.errorMessage ?? 'Job failed',
      ...(input.failureClass === undefined ? {} : { failureClass: input.failureClass }),
      ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    });
  }

  async completeCancelled(input: CompleteJobCancelInput): Promise<JobRun> {
    return this.finish(input.jobId, input.workerId, 'CANCELLED', {
      failureClass: 'CANCELLED',
      errorMessage: input.errorMessage ?? 'Job cancelled',
      ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    });
  }

  async cancel(jobId: string): Promise<JobRun> {
    const now = this.now();
    return withTransaction(this.db, async (tx) => {
      const jobs = new JobRunsRepository(tx);
      const job = await jobs.getById(jobId);
      if (!job) {
        throw new QueueError('Job run not found', { details: { jobId } });
      }
      if (job.status === 'CANCELLED') {
        return job;
      }
      if (job.status === 'RUNNING') {
        const updated = await jobs.update(jobId, { cancelRequestedAt: now });
        if (!updated) {
          throw new QueueError('Failed to request job cancellation', { details: { jobId } });
        }
        return updated;
      }
      assertTransition(job.status, 'CANCELLED');
      const updated = await jobs.update(jobId, {
        status: 'CANCELLED',
        cancelRequestedAt: now,
        finishedAt: now,
        leaseExpiresAt: null,
        failureClass: 'CANCELLED',
        errorMessage: 'Job cancelled',
      });
      if (!updated) {
        throw new QueueError('Failed to cancel job run', { details: { jobId } });
      }
      return updated;
    });
  }

  async countRunning(): Promise<number> {
    return new JobRunsRepository(this.db).countByStatuses(['RUNNING']);
  }

  async heartbeat(workerId: string, currentJobId?: string | null): Promise<void> {
    const now = this.now();
    const leaseExpiresAt = new Date(now.getTime() + this.options.leaseSeconds * 1000);
    await new WorkersRepository(this.db).heartbeat(workerId, currentJobId);
    await new JobRunsRepository(this.db).renewLeasesForWorker(workerId, leaseExpiresAt, now);
  }

  async markRetryWait(jobId: string): Promise<JobRun> {
    const now = this.now();
    return withTransaction(this.db, async (tx) => {
      const jobs = new JobRunsRepository(tx);
      const job = await jobs.getById(jobId);
      if (!job) {
        throw new QueueError('Job run not found', { details: { jobId } });
      }
      assertTransition(job.status, 'RETRY_WAIT');
      const updated = await jobs.update(jobId, {
        status: 'RETRY_WAIT',
        workerId: null,
        leaseExpiresAt: null,
        updatedAt: now,
      });
      if (!updated) {
        throw new QueueError('Failed to mark job for retry', { details: { jobId } });
      }
      return updated;
    });
  }

  async requeueDueRetries(): Promise<JobRun[]> {
    const now = this.now();
    return withTransaction(this.db, async (tx) => {
      const jobs = new JobRunsRepository(tx);
      const schedules = new SchedulesRepository(tx);
      const waiting = await jobs.listByStatus('RETRY_WAIT');
      const requeued: JobRun[] = [];
      for (const job of waiting) {
        const schedule = await schedules.getById(job.scheduleId);
        const delayMs = (schedule?.retryDelaySeconds ?? 60) * 1000;
        if (now.getTime() - job.updatedAt.getTime() < delayMs) {
          continue;
        }
        assertTransition('RETRY_WAIT', 'QUEUED');
        const updated = await jobs.update(job.id, {
          status: 'QUEUED',
          attempt: job.attempt + 1,
          queuedAt: now,
          workerId: null,
          startedAt: null,
          finishedAt: null,
          leaseExpiresAt: null,
        });
        if (updated) {
          requeued.push(updated);
        }
      }
      return requeued;
    });
  }

  async recoverStaleJobs(): Promise<JobRun[]> {
    const now = this.now();
    return withTransaction(this.db, async (tx) => {
      const jobs = new JobRunsRepository(tx);
      const workers = new WorkersRepository(tx);
      const stale = await jobs.markStaleLeases(now);
      for (const job of stale) {
        assertTransition('RUNNING', 'STALE');
        if (job.workerId) {
          const remaining = await jobs.listByWorkerAndStatuses(job.workerId, ['RUNNING']);
          if (remaining.length === 0) {
            await workers.update(job.workerId, {
              status: 'IDLE',
              currentJobId: null,
              lastHeartbeat: now,
            });
          }
        }
      }
      return stale;
    });
  }

  private async finish(
    jobId: string,
    workerId: string,
    status: 'SUCCESS' | 'FAILED' | 'CANCELLED',
    extra: {
      exitCode?: number | null;
      errorMessage?: string;
      failureClass?: FailureClass;
      commitSha?: string | null;
      repositoryUrl?: string | null;
      branch?: string | null;
      metrics?: JobRunMetrics | null;
      durationMs?: number | null;
    },
  ): Promise<JobRun> {
    const now = this.now();
    return withTransaction(this.db, async (tx) => {
      const jobs = new JobRunsRepository(tx);
      const workers = new WorkersRepository(tx);
      const job = await jobs.getById(jobId);
      if (!job) {
        throw new QueueError('Job run not found', { details: { jobId } });
      }
      if (job.workerId !== workerId) {
        throw new QueueError('Job is not assigned to this worker', {
          details: { jobId, workerId },
        });
      }
      assertTransition(job.status, status);

      const updated = await jobs.update(jobId, {
        status,
        finishedAt: now,
        leaseExpiresAt: null,
        ...extra,
      });
      if (!updated) {
        throw new QueueError('Failed to update job run', { details: { jobId } });
      }

      const remaining = await jobs.listByWorkerAndStatuses(workerId, ['RUNNING']);
      await workers.update(workerId, {
        status: remaining.length > 0 ? 'RUNNING' : 'IDLE',
        currentJobId: remaining[0]?.id ?? null,
        lastHeartbeat: now,
      });
      return updated;
    });
  }
}

function buildJobInsert(
  schedule: Schedule,
  input: EnqueueJobInput,
): {
  scheduleId: string;
  projectId: string;
  priority: number;
  dbtCommand: DbtCommand;
  dbtArguments: string[];
  maxAttempts: number;
  triggerType: JobTriggerType;
  scheduledFor?: Date | null;
  idempotencyKey?: string | null;
} {
  return {
    scheduleId: schedule.id,
    projectId: schedule.projectId,
    priority: input.priority ?? schedule.priority,
    dbtCommand: schedule.dbtCommand,
    dbtArguments: schedule.dbtArguments,
    maxAttempts: schedule.maxRetries + 1,
    triggerType: input.triggerType ?? 'SCHEDULED',
    ...(input.scheduledFor === undefined ? {} : { scheduledFor: input.scheduledFor }),
    ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
  };
}
