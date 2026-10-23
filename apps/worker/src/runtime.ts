import type { AppConfig } from '@dbt-scheduler/config';
import {
  JobRunsRepository,
  WorkersRepository,
  type Database,
  type JobRun,
  type Worker,
} from '@dbt-scheduler/database';
import { isRetryableFailure } from '@dbt-scheduler/dbt-runner';
import type { runDbt as defaultRunDbt } from '@dbt-scheduler/dbt-runner';
import { cleanupExpiredWorkspaces as defaultCleanupWorkspaces } from '@dbt-scheduler/git-manager';
import type { prepareJobRepository as defaultPrepareJobRepository } from '@dbt-scheduler/git-manager';
import { JobQueue } from '@dbt-scheduler/job-queue';
import type { Logger } from '@dbt-scheduler/logging';
import { executeClaimedJob, type ExecuteJobResult } from './execute-job.js';

export const DEFAULT_POLL_INTERVAL_MS = 1_000;

export interface WorkerRuntimeOptions {
  config: AppConfig;
  db: Database;
  logger: Logger;
  hostname: string;
  workerName: string;
  pollIntervalMs?: number;
  now?: () => Date;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  prepareRepository?: typeof defaultPrepareJobRepository;
  runDbt?: typeof defaultRunDbt;
  cleanupWorkspaces?: typeof defaultCleanupWorkspaces;
}

export class WorkerRuntime {
  private worker: Worker | undefined;
  private draining = false;
  private readonly inflight = new Map<string, { abort: AbortController; done: Promise<void> }>();
  private readonly stopAbort = new AbortController();
  private readonly queue: JobQueue;

  constructor(private readonly options: WorkerRuntimeOptions) {
    this.queue = new JobQueue(options.db, {
      leaseSeconds: options.config.JOB_LEASE_SECONDS,
      maxConcurrentJobs: options.config.MAX_CONCURRENT_JOBS,
      ...(options.now === undefined ? {} : { now: options.now }),
    });
  }

  get workerId(): string {
    if (!this.worker) {
      throw new Error('Worker is not registered');
    }
    return this.worker.id;
  }

  async start(): Promise<Worker> {
    const workers = new WorkersRepository(this.options.db);
    this.worker = await workers.register({
      workerName: this.options.workerName,
      hostname: this.options.hostname,
      concurrency: this.options.config.WORKER_CONCURRENCY,
      status: 'STARTING',
    });
    await workers.update(this.worker.id, { status: 'IDLE' });
    this.options.logger.info(
      {
        event: 'worker_registered',
        worker_id: this.worker.id,
        worker_name: this.worker.workerName,
        hostname: this.worker.hostname,
      },
      'Worker registered',
    );

    const cleanup = this.options.cleanupWorkspaces ?? defaultCleanupWorkspaces;
    try {
      const result = await cleanup({
        workspaceRoot: this.options.config.WORKSPACE_ROOT,
        retentionHours: this.options.config.WORKSPACE_RETENTION_HOURS,
      });
      if (result.removed.length > 0) {
        this.options.logger.info(
          { event: 'workspace_cleanup', removed: result.removed.length },
          'Removed expired job workspaces',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'workspace cleanup failed';
      this.options.logger.warn({ event: 'workspace_cleanup_failed' }, message);
    }

    return this.worker;
  }

  async loop(): Promise<void> {
    const pollIntervalMs =
      this.options.pollIntervalMs ?? this.options.config.HEARTBEAT_INTERVAL_SECONDS * 1000;
    const sleep = this.options.sleep ?? sleepMs;
    while (!this.draining) {
      try {
        await this.tick();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'worker tick failed';
        this.options.logger.error({ event: 'worker_tick_failed' }, message);
      }
      await sleep(pollIntervalMs, this.stopAbort.signal);
    }
  }

  async tick(): Promise<void> {
    if (!this.worker) {
      throw new Error('Worker is not registered');
    }

    const currentJobId = this.inflight.keys().next().value ?? null;
    await this.queue.heartbeat(this.worker.id, currentJobId);
    await this.abortCancelledJobs();

    if (this.draining) {
      return;
    }

    await this.queue.recoverStaleJobs();
    const requeued = await this.queue.requeueDueRetries();
    for (const job of requeued) {
      this.options.logger.info(
        { event: 'job_requeued', job_id: job.id, attempt: job.attempt },
        'Retry wait elapsed; job requeued',
      );
    }

    await this.fillSlots();
  }

  async waitForIdle(): Promise<void> {
    await Promise.all([...this.inflight.values()].map((entry) => entry.done));
  }

  async stop(signal: NodeJS.Signals): Promise<void> {
    this.draining = true;
    if (!this.stopAbort.signal.aborted) {
      this.stopAbort.abort();
    }
    if (this.worker) {
      await new WorkersRepository(this.options.db).update(this.worker.id, {
        status: 'DRAINING',
      });
    }
    this.options.logger.info(
      {
        event: 'worker_draining',
        signal,
        in_flight: this.inflight.size,
        worker_id: this.worker?.id,
      },
      'Worker stopped claiming; cancelling in-flight jobs',
    );
    for (const entry of this.inflight.values()) {
      entry.abort.abort();
    }
    await Promise.all([...this.inflight.values()].map((entry) => entry.done));
    if (this.worker) {
      await new WorkersRepository(this.options.db).update(this.worker.id, {
        status: 'STOPPED',
        currentJobId: null,
      });
    }
  }

  private async abortCancelledJobs(): Promise<void> {
    const jobs = new JobRunsRepository(this.options.db);
    for (const [jobId, entry] of this.inflight) {
      const job = await jobs.getById(jobId);
      if (job?.cancelRequestedAt) {
        this.options.logger.info(
          { event: 'job_cancel_requested', job_id: jobId },
          'Cancelling dbt',
        );
        entry.abort.abort();
      }
    }
  }

  private async fillSlots(): Promise<void> {
    if (!this.worker) {
      return;
    }
    const concurrency = this.options.config.WORKER_CONCURRENCY;
    const maxConcurrent = this.options.config.MAX_CONCURRENT_JOBS;

    while (!this.draining && this.inflight.size < concurrency) {
      const running = await this.queue.countRunning();
      if (running >= maxConcurrent) {
        this.options.logger.debug(
          { event: 'global_concurrency_reached', running, max: maxConcurrent },
          'Global job cap reached',
        );
        break;
      }

      const job = await this.queue.claim(this.worker.id);
      if (!job) {
        break;
      }
      this.options.logger.info(
        { event: 'job_claimed', job_id: job.id, schedule_id: job.scheduleId },
        'Claimed job',
      );
      this.startJob(job);
    }
  }

  private startJob(job: JobRun): void {
    const abort = new AbortController();
    const onStop = (): void => {
      abort.abort();
    };
    this.stopAbort.signal.addEventListener('abort', onStop, { once: true });

    const done = this.runJob(job, abort.signal).finally(() => {
      this.stopAbort.signal.removeEventListener('abort', onStop);
      this.inflight.delete(job.id);
    });
    this.inflight.set(job.id, { abort, done });
  }

  private async runJob(job: JobRun, signal: AbortSignal): Promise<void> {
    try {
      const result = await executeClaimedJob({
        job,
        db: this.options.db,
        config: this.options.config,
        logger: this.options.logger,
        signal,
        ...(this.options.prepareRepository === undefined
          ? {}
          : { prepareRepository: this.options.prepareRepository }),
        ...(this.options.runDbt === undefined ? {} : { runDbt: this.options.runDbt }),
      });
      await this.completeJob(job, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Job execution failed';
      this.options.logger.error({ event: 'job_unhandled_error', job_id: job.id }, message);
      try {
        await this.completeJob(job, {
          outcome: 'FAILED',
          failureClass: 'WORKER_FAILURE',
          errorMessage: message,
          durationMs: 0,
        });
      } catch (completeError) {
        const completeMessage =
          completeError instanceof Error ? completeError.message : 'Failed to record job failure';
        this.options.logger.error(
          { event: 'job_complete_failed', job_id: job.id },
          completeMessage,
        );
      }
    }
  }

  private async completeJob(job: JobRun, result: ExecuteJobResult): Promise<void> {
    if (!this.worker) {
      return;
    }
    const workerId = this.worker.id;
    if (result.outcome === 'SUCCESS') {
      await this.queue.completeSuccess({
        jobId: job.id,
        workerId,
        exitCode: result.exitCode ?? 0,
        durationMs: result.durationMs,
        ...(result.commitSha === undefined ? {} : { commitSha: result.commitSha }),
        ...(result.repositoryUrl === undefined ? {} : { repositoryUrl: result.repositoryUrl }),
        ...(result.branch === undefined ? {} : { branch: result.branch }),
        ...(result.metrics === undefined ? {} : { metrics: result.metrics }),
      });
      this.options.logger.info({ event: 'job_succeeded', job_id: job.id }, 'Job succeeded');
      return;
    }
    if (result.outcome === 'CANCELLED') {
      await this.queue.completeCancelled({
        jobId: job.id,
        workerId,
        durationMs: result.durationMs,
        ...(result.errorMessage === undefined ? {} : { errorMessage: result.errorMessage }),
      });
      this.options.logger.info({ event: 'job_cancelled', job_id: job.id }, 'Job cancelled');
      return;
    }

    const failed = await this.queue.completeFailure({
      jobId: job.id,
      workerId,
      durationMs: result.durationMs,
      ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
      ...(result.errorMessage === undefined ? {} : { errorMessage: result.errorMessage }),
      ...(result.failureClass === undefined ? {} : { failureClass: result.failureClass }),
    });
    this.options.logger.warn(
      {
        event: 'job_failed',
        job_id: job.id,
        failure_class: failed.failureClass,
        attempt: failed.attempt,
        max_attempts: failed.maxAttempts,
      },
      'Job failed',
    );

    if (
      isRetryableFailure(failed.failureClass ?? undefined) &&
      failed.attempt < failed.maxAttempts
    ) {
      await this.queue.markRetryWait(failed.id);
      this.options.logger.info(
        { event: 'job_retry_scheduled', job_id: failed.id, attempt: failed.attempt },
        'Retryable failure scheduled',
      );
    }
  }
}

export function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
