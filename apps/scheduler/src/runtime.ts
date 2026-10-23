import type { AppConfig } from '@dbt-scheduler/config';
import {
  ProjectsRepository,
  ScheduleExecutionKeysRepository,
  SchedulesRepository,
  withTransaction,
  type Database,
} from '@dbt-scheduler/database';
import { getRemoteHeadCommitSha } from '@dbt-scheduler/git-manager';
import { JobQueue } from '@dbt-scheduler/job-queue';
import type { Logger } from '@dbt-scheduler/logging';
import {
  buildScheduleExecutionKey,
  nextOccurrenceAfter,
  nextRunAtAfterCatchUp,
} from '@dbt-scheduler/scheduler-core';
import type { JobTriggerType } from '@dbt-scheduler/types';
import { UniqueConstraintError, ValidationError } from '@dbt-scheduler/types';

export interface SchedulerRuntimeOptions {
  config: AppConfig;
  db: Database;
  logger: Logger;
  pollIntervalMs?: number;
  now?: () => Date;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface TickSummary {
  jobsCreated: number;
  jobsSkipped: number;
  schedulesAdvanced: number;
  schedulesInitialized: number;
  schedulesPolledUnchanged: number;
}

export class SchedulerRuntime {
  private draining = false;
  private readonly stopAbort = new AbortController();
  private readonly queue: JobQueue;

  constructor(private readonly options: SchedulerRuntimeOptions) {
    this.queue = new JobQueue(options.db, {
      leaseSeconds: options.config.JOB_LEASE_SECONDS,
      maxConcurrentJobs: options.config.MAX_CONCURRENT_JOBS,
      ...(options.now === undefined ? {} : { now: options.now }),
    });
  }

  async loop(): Promise<void> {
    const pollIntervalMs =
      this.options.pollIntervalMs ?? this.options.config.SCHEDULER_TICK_INTERVAL_SECONDS * 1000;
    const sleep = this.options.sleep ?? sleepMs;
    while (!this.draining) {
      try {
        await this.tick();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'scheduler tick failed';
        this.options.logger.error({ event: 'scheduler_tick_failed' }, message);
      }
      await sleep(pollIntervalMs, this.stopAbort.signal);
    }
  }

  async tick(): Promise<TickSummary> {
    const now = this.options.now?.() ?? new Date();
    const summary: TickSummary = {
      jobsCreated: 0,
      jobsSkipped: 0,
      schedulesAdvanced: 0,
      schedulesInitialized: 0,
      schedulesPolledUnchanged: 0,
    };
    const schedules = new SchedulesRepository(this.options.db);
    const missing = await schedules.listEnabledWithoutNextRun();
    for (const schedule of missing) {
      try {
        const initialized = await this.initializeSchedule(schedule.id, now);
        if (initialized) {
          summary.schedulesInitialized += 1;
        }
      } catch (error) {
        this.logScheduleError(schedule.id, error);
      }
    }
    const due = await schedules.listEnabledDue(now);
    for (const schedule of due) {
      try {
        const result = await this.tickSchedule(schedule.id, now);
        summary.jobsCreated += result.jobsCreated;
        summary.jobsSkipped += result.jobsSkipped;
        summary.schedulesAdvanced += result.schedulesAdvanced;
        summary.schedulesPolledUnchanged += result.schedulesPolledUnchanged;
      } catch (error) {
        this.logScheduleError(schedule.id, error);
      }
    }
    return summary;
  }

  async stop(signal: NodeJS.Signals): Promise<void> {
    this.draining = true;
    if (!this.stopAbort.signal.aborted) {
      this.stopAbort.abort();
    }
    this.options.logger.info({ event: 'scheduler_stopping', signal }, 'Scheduler stopped ticking');
  }

  private logScheduleError(scheduleId: string, error: unknown): void {
    const message = error instanceof Error ? error.message : 'schedule tick failed';
    this.options.logger.error(
      {
        event: error instanceof ValidationError ? 'schedule_cron_invalid' : 'schedule_tick_failed',
        schedule_id: scheduleId,
      },
      message,
    );
  }

  private async initializeSchedule(scheduleId: string, now: Date): Promise<boolean> {
    return withTransaction(this.options.db, async (tx) => {
      const schedules = new SchedulesRepository(tx);
      const schedule = await schedules.lockById(scheduleId);
      if (!schedule?.enabled || schedule.nextRunAt) {
        return false;
      }
      const nextRunAt = nextOccurrenceAfter(schedule.cronExpression, schedule.timezone, now);
      await schedules.update(schedule.id, { nextRunAt });
      this.options.logger.info(
        {
          event: 'schedule_initialized',
          schedule_id: schedule.id,
          next_run_at: nextRunAt.toISOString(),
        },
        'Initialized next_run_at',
      );
      return true;
    });
  }

  private async tickSchedule(
    scheduleId: string,
    now: Date,
  ): Promise<
    Pick<
      TickSummary,
      'jobsCreated' | 'jobsSkipped' | 'schedulesAdvanced' | 'schedulesPolledUnchanged'
    >
  > {
    const result = {
      jobsCreated: 0,
      jobsSkipped: 0,
      schedulesAdvanced: 0,
      schedulesPolledUnchanged: 0,
    };
    await withTransaction(this.options.db, async (tx) => {
      const schedules = new SchedulesRepository(tx);
      const keys = new ScheduleExecutionKeysRepository(tx);
      const projects = new ProjectsRepository(tx);
      const schedule = await schedules.lockById(scheduleId);
      if (
        !schedule?.enabled ||
        !schedule.nextRunAt ||
        schedule.nextRunAt.getTime() > now.getTime()
      ) {
        return;
      }

      const scheduledFor = schedule.nextRunAt;

      // pollForChanges schedules reuse cron/next_run_at purely as the poll
      // cadence: a tick only enqueues a job when the polled commit differs
      // from lastSeenCommitSha. A null lastSeenCommitSha (first-ever poll)
      // counts as "changed" so the first poll always triggers one run.
      let shouldEnqueue = true;
      let polledCommitSha: string | undefined;
      if (schedule.pollForChanges) {
        shouldEnqueue = false;
        const project = await projects.getById(schedule.projectId);
        if (project && project.sourceMode === 'git') {
          try {
            polledCommitSha = await getRemoteHeadCommitSha({
              repositoryUrl: project.repositoryUrl,
              branch: project.branch,
              ...(this.options.config.GIT_TOKEN === undefined
                ? {}
                : { token: this.options.config.GIT_TOKEN }),
            });
            if (polledCommitSha !== undefined) {
              shouldEnqueue = polledCommitSha !== schedule.lastSeenCommitSha;
              if (!shouldEnqueue) {
                result.schedulesPolledUnchanged += 1;
              }
            }
          } catch (error) {
            polledCommitSha = undefined;
            const message = error instanceof Error ? error.message : 'git poll failed';
            this.options.logger.warn(
              { event: 'schedule_poll_failed', schedule_id: schedule.id },
              message,
            );
          }
        }
      }

      if (shouldEnqueue) {
        const existingKey = await keys.getByScheduleAndTime(schedule.id, scheduledFor);
        if (!existingKey) {
          try {
            const triggerType: JobTriggerType = schedule.pollForChanges
              ? 'GIT_CHANGE'
              : 'SCHEDULED';
            const enqueued = await this.queue.enqueueWith(tx, {
              scheduleId: schedule.id,
              triggerType,
              scheduledFor,
              idempotencyKey: buildScheduleExecutionKey(schedule.id, scheduledFor),
            });
            const jobRunId =
              enqueued.outcome === 'QUEUED' ? enqueued.job.id : enqueued.existingJobId;
            await keys.create({
              scheduleId: schedule.id,
              scheduledFor,
              jobRunId,
            });
            if (enqueued.outcome === 'QUEUED') {
              result.jobsCreated += 1;
              this.options.logger.info(
                {
                  event: 'job_created',
                  job_id: enqueued.job.id,
                  schedule_id: schedule.id,
                  scheduled_for: scheduledFor.toISOString(),
                },
                'Created scheduled job',
              );
            } else {
              result.jobsSkipped += 1;
              this.options.logger.info(
                {
                  event: 'job_skipped',
                  job_id: enqueued.existingJobId,
                  schedule_id: schedule.id,
                  reason: enqueued.reason,
                  scheduled_for: scheduledFor.toISOString(),
                },
                'Skipped scheduled job because a run is already in flight',
              );
            }
          } catch (error) {
            if (!(error instanceof UniqueConstraintError)) {
              throw error;
            }
            this.options.logger.info(
              {
                event: 'job_duplicate_ignored',
                schedule_id: schedule.id,
                scheduled_for: scheduledFor.toISOString(),
              },
              'Duplicate scheduled execution ignored',
            );
          }
        }
      }

      const nextRunAt = nextRunAtAfterCatchUp(
        schedule.cronExpression,
        schedule.timezone,
        scheduledFor,
        now,
      );
      await schedules.update(schedule.id, {
        nextRunAt,
        lastRunAt: now,
        ...(polledCommitSha === undefined ? {} : { lastSeenCommitSha: polledCommitSha }),
      });
      result.schedulesAdvanced += 1;
    });
    return result;
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
