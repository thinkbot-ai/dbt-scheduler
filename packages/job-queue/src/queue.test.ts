import { JOB_PRIORITIES, QueueError } from '@dbt-scheduler/types';
import {
  JobRunsRepository,
  ProjectsRepository,
  SchedulesRepository,
  WorkersRepository,
} from '@dbt-scheduler/database';
import { createTestDatabase, type TestDatabase } from '@dbt-scheduler/database/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JobQueue } from './queue.js';
import { assertTransition } from './state-machine.js';

describe('assertTransition', () => {
  it('rejects illegal state changes', () => {
    expect(() => assertTransition('QUEUED', 'SUCCESS')).toThrow(QueueError);
    expect(() => assertTransition('RUNNING', 'SUCCESS')).not.toThrow();
  });
});

describe('JobQueue', { timeout: 30_000 }, () => {
  let database: TestDatabase;
  let queue: JobQueue;

  beforeEach(async () => {
    database = await createTestDatabase();
    queue = new JobQueue(database.db, { leaseSeconds: 60 });
  });

  afterEach(async () => {
    await database.close();
  });

  async function seed(
    concurrencyPolicy: 'SKIP_IF_RUNNING' | 'QUEUE' | 'ALLOW' = 'QUEUE',
    maxConcurrentJobs = 5,
  ) {
    const project = await new ProjectsRepository(database.db).create({
      name: 'analytics',
      repositoryUrl: 'https://github.com/example/analytics-dbt.git',
      branch: 'main',
      maxConcurrentJobs,
    });
    const schedule = await new SchedulesRepository(database.db).create({
      projectId: project.id,
      name: 'hourly-build',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      dbtCommand: 'build',
      priority: JOB_PRIORITIES.NORMAL,
      concurrencyPolicy,
    });
    const workerA = await new WorkersRepository(database.db).register({
      workerName: 'worker-a',
      hostname: 'host-a',
    });
    const workerB = await new WorkersRepository(database.db).register({
      workerName: 'worker-b',
      hostname: 'host-b',
    });
    return { project, schedule, workerA, workerB };
  }

  it('claims the highest priority queued job first', async () => {
    const { schedule, workerA } = await seed();
    const olderNormal = await queue.enqueue({
      scheduleId: schedule.id,
      priority: JOB_PRIORITIES.NORMAL,
    });
    const newerCritical = await queue.enqueue({
      scheduleId: schedule.id,
      priority: JOB_PRIORITIES.CRITICAL,
    });
    expect(olderNormal.outcome).toBe('QUEUED');
    expect(newerCritical.outcome).toBe('QUEUED');
    if (olderNormal.outcome !== 'QUEUED' || newerCritical.outcome !== 'QUEUED') {
      throw new Error('expected queued jobs');
    }

    const claimed = await queue.claim(workerA.id);
    expect(claimed?.id).toBe(newerCritical.job.id);
    expect(claimed?.status).toBe('RUNNING');
    expect(claimed?.workerId).toBe(workerA.id);
    expect(claimed?.leaseExpiresAt).toBeInstanceOf(Date);
  });

  it('does not let two workers claim the same job', async () => {
    const { project, schedule, workerA, workerB } = await seed('ALLOW');
    const otherSchedule = await new SchedulesRepository(database.db).create({
      projectId: project.id,
      name: 'hourly-test',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      dbtCommand: 'test',
      priority: JOB_PRIORITIES.NORMAL,
      concurrencyPolicy: 'ALLOW',
    });
    const first = await queue.enqueue({
      scheduleId: schedule.id,
      priority: JOB_PRIORITIES.HIGH,
    });
    const second = await queue.enqueue({
      scheduleId: otherSchedule.id,
      priority: JOB_PRIORITIES.NORMAL,
    });
    expect(first.outcome).toBe('QUEUED');
    expect(second.outcome).toBe('QUEUED');

    const [claimA, claimB] = await Promise.all([queue.claim(workerA.id), queue.claim(workerB.id)]);
    const claimedIds = [claimA?.id, claimB?.id].filter((id): id is string => id !== undefined);
    expect(claimedIds).toHaveLength(2);
    expect(new Set(claimedIds).size).toBe(2);

    const leftover = await queue.claim(workerA.id);
    expect(leftover).toBeUndefined();
  });

  it('skips enqueue when SKIP_IF_RUNNING and a run is already in flight', async () => {
    const { schedule, workerA } = await seed('SKIP_IF_RUNNING');
    const first = await queue.enqueue({ scheduleId: schedule.id });
    const second = await queue.enqueue({ scheduleId: schedule.id });
    expect(first.outcome).toBe('QUEUED');
    expect(second).toMatchObject({ outcome: 'SKIPPED', reason: 'SKIP_IF_RUNNING' });
    if (first.outcome === 'QUEUED' && second.outcome === 'SKIPPED') {
      expect(second.existingJobId).toBe(first.job.id);
    }

    const claimed = await queue.claim(workerA.id);
    expect(claimed?.status).toBe('RUNNING');
    const third = await queue.enqueue({ scheduleId: schedule.id });
    expect(third).toMatchObject({ outcome: 'SKIPPED', reason: 'SKIP_IF_RUNNING' });
  });

  it('queues another run when the policy is QUEUE', async () => {
    const { schedule } = await seed('QUEUE');
    const first = await queue.enqueue({ scheduleId: schedule.id });
    const second = await queue.enqueue({ scheduleId: schedule.id });
    expect(first.outcome).toBe('QUEUED');
    expect(second.outcome).toBe('QUEUED');
  });

  it('completes a claimed job as SUCCESS or FAILED', async () => {
    const { schedule, workerA, workerB } = await seed('ALLOW');
    await queue.enqueue({ scheduleId: schedule.id });
    await queue.enqueue({ scheduleId: schedule.id });
    const running = await queue.claim(workerA.id);
    const other = await queue.claim(workerB.id);
    expect(running).toBeDefined();
    expect(other).toBeDefined();
    if (!running || !other) {
      throw new Error('expected two claimed jobs');
    }

    const success = await queue.completeSuccess({
      jobId: running.id,
      workerId: workerA.id,
      exitCode: 0,
      commitSha: '8f12ab32',
    });
    expect(success.status).toBe('SUCCESS');
    expect(success.commitSha).toBe('8f12ab32');
    expect(success.finishedAt).toBeInstanceOf(Date);

    const failed = await queue.completeFailure({
      jobId: other.id,
      workerId: workerB.id,
      exitCode: 1,
      failureClass: 'DBT_FAILURE',
      errorMessage: 'dbt exited with code 1',
    });
    expect(failed.status).toBe('FAILED');
    expect(failed.failureClass).toBe('DBT_FAILURE');

    const worker = await new WorkersRepository(database.db).getById(workerA.id);
    expect(worker?.status).toBe('IDLE');
    expect(worker?.currentJobId).toBeNull();
  });

  it('cancels a queued job and requests cancel on a running job', async () => {
    const { schedule, workerA } = await seed();
    const queued = await queue.enqueue({ scheduleId: schedule.id, priority: JOB_PRIORITIES.LOW });
    const claimed = await queue.enqueue({
      scheduleId: schedule.id,
      priority: JOB_PRIORITIES.HIGH,
    });
    expect(queued.outcome).toBe('QUEUED');
    expect(claimed.outcome).toBe('QUEUED');
    if (queued.outcome !== 'QUEUED' || claimed.outcome !== 'QUEUED') {
      throw new Error('expected queued jobs');
    }

    const running = await queue.claim(workerA.id);
    expect(running?.id).toBe(claimed.job.id);
    if (!running) {
      throw new Error('expected a claimed job');
    }

    const requested = await queue.cancel(running.id);
    expect(requested.status).toBe('RUNNING');
    expect(requested.cancelRequestedAt).toBeInstanceOf(Date);

    const cancelled = await queue.cancel(queued.job.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.failureClass).toBe('CANCELLED');
  });

  it('rejects completing a job from the wrong worker', async () => {
    const { schedule, workerA, workerB } = await seed();
    await queue.enqueue({ scheduleId: schedule.id });
    const running = await queue.claim(workerA.id);
    if (!running) {
      throw new Error('expected a claimed job');
    }
    await expect(
      queue.completeSuccess({ jobId: running.id, workerId: workerB.id }),
    ).rejects.toThrow(QueueError);
  });

  it('marks expired leases STALE instead of success or failed', async () => {
    const now = new Date('2026-08-26T18:00:00.000Z');
    queue = new JobQueue(database.db, {
      leaseSeconds: 60,
      now: () => now,
    });
    const { schedule, workerA } = await seed();
    await queue.enqueue({ scheduleId: schedule.id });
    const running = await queue.claim(workerA.id);
    expect(running?.status).toBe('RUNNING');
    if (!running) {
      throw new Error('expected a claimed job');
    }

    await new JobRunsRepository(database.db).update(running.id, {
      leaseExpiresAt: new Date(now.getTime() - 1000),
    });

    const recovered = await queue.recoverStaleJobs();
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.status).toBe('STALE');
    expect(recovered[0]?.id).toBe(running?.id);

    const worker = await new WorkersRepository(database.db).getById(workerA.id);
    expect(worker?.status).toBe('IDLE');
  });

  it('moves a failed retryable job through RETRY_WAIT back to QUEUED', async () => {
    const now = new Date('2026-08-26T18:00:00.000Z');
    queue = new JobQueue(database.db, {
      leaseSeconds: 60,
      now: () => now,
    });
    const { project, workerA } = await seed();
    const schedule = await new SchedulesRepository(database.db).create({
      projectId: project.id,
      name: 'retry-build',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      dbtCommand: 'build',
      maxRetries: 1,
      retryDelaySeconds: 30,
    });
    await queue.enqueue({ scheduleId: schedule.id });
    const running = await queue.claim(workerA.id);
    if (!running) {
      throw new Error('expected a claimed job');
    }
    await queue.completeFailure({
      jobId: running.id,
      workerId: workerA.id,
      failureClass: 'TRANSIENT_FAILURE',
      errorMessage: 'connection timed out',
    });
    const waiting = await queue.markRetryWait(running.id);
    expect(waiting.status).toBe('RETRY_WAIT');

    const tooSoon = await queue.requeueDueRetries();
    expect(tooSoon).toHaveLength(0);

    queue = new JobQueue(database.db, {
      leaseSeconds: 60,
      now: () => new Date(now.getTime() + 31_000),
    });
    const requeued = await queue.requeueDueRetries();
    expect(requeued).toHaveLength(1);
    expect(requeued[0]?.status).toBe('QUEUED');
    expect(requeued[0]?.attempt).toBe(2);
    expect(requeued[0]?.workerId).toBeNull();
  });

  it('keeps a second QUEUE-policy job queued while the schedule is already running', async () => {
    const { schedule, workerA, workerB } = await seed('QUEUE');
    await queue.enqueue({ scheduleId: schedule.id });
    await queue.enqueue({ scheduleId: schedule.id });

    const first = await queue.claim(workerA.id);
    const second = await queue.claim(workerB.id);
    expect(first?.status).toBe('RUNNING');
    expect(second).toBeUndefined();
    expect(await new JobRunsRepository(database.db).countByStatuses(['QUEUED'])).toBe(1);
  });

  it('allows parallel runs of the same schedule when the policy is ALLOW', async () => {
    const { schedule, workerA, workerB } = await seed('ALLOW');
    await queue.enqueue({ scheduleId: schedule.id });
    await queue.enqueue({ scheduleId: schedule.id });

    const [claimA, claimB] = await Promise.all([queue.claim(workerA.id), queue.claim(workerB.id)]);
    expect([claimA?.status, claimB?.status].sort()).toEqual(['RUNNING', 'RUNNING']);
  });

  it('enforces the global running-job cap inside claim', async () => {
    queue = new JobQueue(database.db, { leaseSeconds: 60, maxConcurrentJobs: 1 });
    const { project, schedule, workerA, workerB } = await seed('ALLOW');
    const other = await new SchedulesRepository(database.db).create({
      projectId: project.id,
      name: 'other-build',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      dbtCommand: 'build',
      concurrencyPolicy: 'ALLOW',
    });
    await queue.enqueue({ scheduleId: schedule.id });
    await queue.enqueue({ scheduleId: other.id });

    const [claimA, claimB] = await Promise.all([queue.claim(workerA.id), queue.claim(workerB.id)]);
    const running = [claimA, claimB].filter((job) => job !== undefined);
    expect(running).toHaveLength(1);
    expect(await new JobRunsRepository(database.db).countByStatuses(['QUEUED'])).toBe(1);
  });

  it('enforces per-project maxConcurrentJobs and claims another project instead', async () => {
    const { schedule, workerA, workerB } = await seed('ALLOW', 1);
    const otherProject = await new ProjectsRepository(database.db).create({
      name: 'finance',
      repositoryUrl: 'https://github.com/example/finance-dbt.git',
      branch: 'main',
      maxConcurrentJobs: 2,
    });
    const otherSchedule = await new SchedulesRepository(database.db).create({
      projectId: otherProject.id,
      name: 'finance-build',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      dbtCommand: 'build',
      priority: JOB_PRIORITIES.LOW,
      concurrencyPolicy: 'ALLOW',
    });
    const blocked = await queue.enqueue({
      scheduleId: schedule.id,
      priority: JOB_PRIORITIES.CRITICAL,
    });
    const laterSameProject = await queue.enqueue({
      scheduleId: schedule.id,
      priority: JOB_PRIORITIES.CRITICAL,
    });
    const otherWork = await queue.enqueue({
      scheduleId: otherSchedule.id,
      priority: JOB_PRIORITIES.LOW,
    });
    expect(blocked.outcome).toBe('QUEUED');
    expect(laterSameProject.outcome).toBe('QUEUED');
    expect(otherWork.outcome).toBe('QUEUED');
    if (
      blocked.outcome !== 'QUEUED' ||
      laterSameProject.outcome !== 'QUEUED' ||
      otherWork.outcome !== 'QUEUED'
    ) {
      throw new Error('expected queued jobs');
    }

    const first = await queue.claim(workerA.id);
    expect(first?.id).toBe(blocked.job.id);

    const second = await queue.claim(workerB.id);
    expect(second?.id).toBe(otherWork.job.id);
    expect(second?.projectId).toBe(otherProject.id);
  });

  it('clamps local_directory projects to a single RUNNING job regardless of maxConcurrentJobs/ALLOW policy', async () => {
    const project = await new ProjectsRepository(database.db).create({
      name: 'local-analytics',
      repositoryUrl: 'C:/tmp/local-analytics',
      sourceMode: 'local_directory',
      maxConcurrentJobs: 5,
    });
    const scheduleA = await new SchedulesRepository(database.db).create({
      projectId: project.id,
      name: 'schedule-a',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      dbtCommand: 'build',
      concurrencyPolicy: 'ALLOW',
    });
    const scheduleB = await new SchedulesRepository(database.db).create({
      projectId: project.id,
      name: 'schedule-b',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      dbtCommand: 'build',
      concurrencyPolicy: 'ALLOW',
    });
    const workerA = await new WorkersRepository(database.db).register({
      workerName: 'local-worker-a',
      hostname: 'host-a',
    });
    const workerB = await new WorkersRepository(database.db).register({
      workerName: 'local-worker-b',
      hostname: 'host-b',
    });

    await queue.enqueue({ scheduleId: scheduleA.id });
    await queue.enqueue({ scheduleId: scheduleB.id });

    const [claimA, claimB] = await Promise.all([queue.claim(workerA.id), queue.claim(workerB.id)]);
    const running = [claimA, claimB].filter((job) => job !== undefined);
    expect(running).toHaveLength(1);
    expect(await new JobRunsRepository(database.db).countByStatuses(['QUEUED'])).toBe(1);
  });
});
