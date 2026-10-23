import type {
  DbtCommand,
  FailureClass,
  JobRunMetrics,
  JobStatus,
  JobTriggerType,
} from '@dbt-scheduler/types';
import { DatabaseError } from '@dbt-scheduler/types';
import { and, asc, count, desc, eq, inArray, isNotNull, lte, notInArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { wrapDatabaseError } from '../errors.js';
import { jobRuns } from '../schema/job-runs.js';

/** Transaction-scoped lock so claim counts of RUNNING jobs stay accurate. */
export const JOB_CLAIM_ADVISORY_LOCK = 872_450_001;

export type JobRun = typeof jobRuns.$inferSelect;

export interface CreateJobRunInput {
  scheduleId: string;
  projectId: string;
  priority: number;
  dbtCommand: DbtCommand;
  status?: JobStatus;
  attempt?: number;
  maxAttempts?: number;
  queuedAt?: Date;
  dbtArguments?: string[];
  triggerType?: JobTriggerType;
  scheduledFor?: Date | null;
  idempotencyKey?: string | null;
  repositoryUrl?: string | null;
  branch?: string | null;
  workerId?: string | null;
}

export interface UpdateJobRunInput {
  status?: JobStatus;
  workerId?: string | null;
  attempt?: number;
  queuedAt?: Date;
  commitSha?: string | null;
  repositoryUrl?: string | null;
  branch?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  exitCode?: number | null;
  errorMessage?: string | null;
  failureClass?: FailureClass | null;
  durationMs?: number | null;
  cancelRequestedAt?: Date | null;
  leaseExpiresAt?: Date | null;
  metrics?: JobRunMetrics | null;
  updatedAt?: Date;
}

export class JobRunsRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: CreateJobRunInput): Promise<JobRun> {
    try {
      const [row] = await this.db.insert(jobRuns).values(input).returning();
      if (!row) {
        throw new DatabaseError('Job run insert returned no row');
      }
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to create job run');
    }
  }

  async getById(id: string): Promise<JobRun | undefined> {
    try {
      const [row] = await this.db.select().from(jobRuns).where(eq(jobRuns.id, id)).limit(1);
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to load job run');
    }
  }

  async listBySchedule(scheduleId: string): Promise<JobRun[]> {
    try {
      return await this.db
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.scheduleId, scheduleId))
        .orderBy(desc(jobRuns.queuedAt));
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to list job runs');
    }
  }

  async list(
    filters: {
      status?: JobStatus;
      scheduleId?: string;
      projectId?: string;
      limit?: number;
    } = {},
  ): Promise<JobRun[]> {
    try {
      const conditions = [
        ...(filters.status === undefined ? [] : [eq(jobRuns.status, filters.status)]),
        ...(filters.scheduleId === undefined ? [] : [eq(jobRuns.scheduleId, filters.scheduleId)]),
        ...(filters.projectId === undefined ? [] : [eq(jobRuns.projectId, filters.projectId)]),
      ];
      const query = this.db.select().from(jobRuns);
      const filtered = conditions.length > 0 ? query.where(and(...conditions)) : query;
      return await filtered.orderBy(desc(jobRuns.queuedAt)).limit(filters.limit ?? 100);
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to list job runs');
    }
  }

  async findInFlightBySchedule(scheduleId: string): Promise<JobRun | undefined> {
    try {
      const [row] = await this.db
        .select()
        .from(jobRuns)
        .where(
          and(eq(jobRuns.scheduleId, scheduleId), inArray(jobRuns.status, ['QUEUED', 'RUNNING'])),
        )
        .orderBy(asc(jobRuns.queuedAt))
        .limit(1);
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to find in-flight job run');
    }
  }

  async acquireClaimLock(): Promise<void> {
    try {
      await this.db.execute(sql`select pg_advisory_xact_lock(${JOB_CLAIM_ADVISORY_LOCK})`);
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to acquire job claim lock');
    }
  }

  /**
   * Locks the next queued job with `FOR UPDATE SKIP LOCKED`.
   * Must be called inside a transaction so the lock is held until commit.
   */
  async lockNextQueued(excludeIds: readonly string[] = []): Promise<JobRun | undefined> {
    try {
      const conditions = [
        eq(jobRuns.status, 'QUEUED'),
        ...(excludeIds.length > 0 ? [notInArray(jobRuns.id, [...excludeIds])] : []),
      ];
      const [locked] = await this.db
        .select()
        .from(jobRuns)
        .where(and(...conditions))
        .orderBy(asc(jobRuns.priority), asc(jobRuns.queuedAt), asc(jobRuns.id))
        .limit(1)
        .for('update', { skipLocked: true });
      return locked;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to lock queued job');
    }
  }

  async markQueuedJobRunning(input: {
    jobId: string;
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<JobRun | undefined> {
    try {
      const [claimed] = await this.db
        .update(jobRuns)
        .set({
          status: 'RUNNING',
          workerId: input.workerId,
          startedAt: input.now,
          leaseExpiresAt: input.leaseExpiresAt,
          updatedAt: input.now,
        })
        .where(and(eq(jobRuns.id, input.jobId), eq(jobRuns.status, 'QUEUED')))
        .returning();
      return claimed;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to mark job run running');
    }
  }

  /**
   * Locks the next queued job with `FOR UPDATE SKIP LOCKED` and marks it RUNNING.
   * Must be called inside a transaction so the lock is held until commit.
   */
  async lockAndClaimNextQueued(input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<JobRun | undefined> {
    const locked = await this.lockNextQueued();
    if (!locked) {
      return undefined;
    }
    return this.markQueuedJobRunning({
      jobId: locked.id,
      workerId: input.workerId,
      now: input.now,
      leaseExpiresAt: input.leaseExpiresAt,
    });
  }

  async markStaleLeases(now: Date): Promise<JobRun[]> {
    try {
      return await this.db
        .update(jobRuns)
        .set({
          status: 'STALE',
          updatedAt: now,
        })
        .where(
          and(
            eq(jobRuns.status, 'RUNNING'),
            isNotNull(jobRuns.leaseExpiresAt),
            lte(jobRuns.leaseExpiresAt, now),
          ),
        )
        .returning();
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to mark stale job leases');
    }
  }

  async countByStatuses(
    statuses: readonly JobStatus[],
    filters: { projectId?: string; scheduleId?: string } = {},
  ): Promise<number> {
    try {
      const conditions = [
        inArray(jobRuns.status, [...statuses]),
        ...(filters.projectId === undefined ? [] : [eq(jobRuns.projectId, filters.projectId)]),
        ...(filters.scheduleId === undefined ? [] : [eq(jobRuns.scheduleId, filters.scheduleId)]),
      ];
      const [row] = await this.db
        .select({ value: count() })
        .from(jobRuns)
        .where(and(...conditions));
      return Number(row?.value ?? 0);
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to count job runs');
    }
  }

  async countByWorkerAndStatuses(
    workerId: string,
    statuses: readonly JobStatus[],
  ): Promise<number> {
    try {
      const [row] = await this.db
        .select({ value: count() })
        .from(jobRuns)
        .where(and(eq(jobRuns.workerId, workerId), inArray(jobRuns.status, [...statuses])));
      return Number(row?.value ?? 0);
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to count worker job runs');
    }
  }

  async listByWorkerAndStatuses(
    workerId: string,
    statuses: readonly JobStatus[],
  ): Promise<JobRun[]> {
    try {
      return await this.db
        .select()
        .from(jobRuns)
        .where(and(eq(jobRuns.workerId, workerId), inArray(jobRuns.status, [...statuses])))
        .orderBy(asc(jobRuns.startedAt), asc(jobRuns.id));
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to list worker job runs');
    }
  }

  async listByStatus(status: JobStatus): Promise<JobRun[]> {
    try {
      return await this.db
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.status, status))
        .orderBy(asc(jobRuns.updatedAt), asc(jobRuns.id));
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to list job runs by status');
    }
  }

  async renewLeasesForWorker(workerId: string, leaseExpiresAt: Date, now: Date): Promise<number> {
    try {
      const updated = await this.db
        .update(jobRuns)
        .set({
          leaseExpiresAt,
          updatedAt: now,
        })
        .where(and(eq(jobRuns.workerId, workerId), eq(jobRuns.status, 'RUNNING')))
        .returning({ id: jobRuns.id });
      return updated.length;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to renew job leases');
    }
  }

  async update(id: string, input: UpdateJobRunInput): Promise<JobRun | undefined> {
    try {
      const [row] = await this.db
        .update(jobRuns)
        .set({ ...input, updatedAt: input.updatedAt ?? new Date() })
        .where(eq(jobRuns.id, id))
        .returning();
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to update job run');
    }
  }
}
