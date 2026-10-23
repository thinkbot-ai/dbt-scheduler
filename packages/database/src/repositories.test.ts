import { UniqueConstraintError } from '@dbt-scheduler/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withTransaction } from './client.js';
import {
  JobDependenciesRepository,
  JobLogsRepository,
  JobRunsRepository,
  MAX_JOB_LOG_MESSAGE_CHARS,
  ProjectsRepository,
  ScheduleExecutionKeysRepository,
  SchedulesRepository,
  WorkersRepository,
} from './repositories/index.js';
import { createTestDatabase, type TestDatabase } from './test-database.js';

describe('database repositories', () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  async function createProjectAndSchedule() {
    const projects = new ProjectsRepository(database.db);
    const schedules = new SchedulesRepository(database.db);
    const project = await projects.create({
      name: 'analytics',
      repositoryUrl: 'https://github.com/example/analytics-dbt.git',
      branch: 'main',
      projectPath: '.',
    });
    const schedule = await schedules.create({
      projectId: project.id,
      name: 'hourly-build',
      cronExpression: '0 * * * *',
      timezone: 'America/New_York',
      dbtCommand: 'build',
      priority: 3,
      nextRunAt: new Date('2026-08-26T15:00:00.000Z'),
    });
    return { projects, schedules, project, schedule };
  }

  it('creates and reads a project without storing secrets', async () => {
    const { project } = await createProjectAndSchedule();
    expect(project.credentialsReference).toBeNull();
    expect(project.repositoryUrl).toContain('github.com');
    expect(JSON.stringify(project)).not.toMatch(/ghp_|password|secret/i);
  });

  it('rolls back a failed transaction', async () => {
    const projects = new ProjectsRepository(database.db);
    await expect(
      withTransaction(database.db, async (tx) => {
        await new ProjectsRepository(tx).create({
          name: 'ephemeral',
          repositoryUrl: 'https://github.com/example/ephemeral.git',
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await projects.list()).toHaveLength(0);
  });

  it('rejects duplicate schedule execution keys', async () => {
    const { project, schedule } = await createProjectAndSchedule();
    const jobRuns = new JobRunsRepository(database.db);
    const keys = new ScheduleExecutionKeysRepository(database.db);
    const scheduledFor = new Date('2026-08-26T15:00:00.000Z');

    const first = await withTransaction(database.db, async (tx) => {
      const job = await new JobRunsRepository(tx).create({
        scheduleId: schedule.id,
        projectId: project.id,
        priority: 3,
        dbtCommand: 'build',
        triggerType: 'SCHEDULED',
        scheduledFor,
      });
      await new ScheduleExecutionKeysRepository(tx).create({
        scheduleId: schedule.id,
        scheduledFor,
        jobRunId: job.id,
      });
      return job;
    });

    await expect(
      withTransaction(database.db, async (tx) => {
        const job = await new JobRunsRepository(tx).create({
          scheduleId: schedule.id,
          projectId: project.id,
          priority: 3,
          dbtCommand: 'build',
          triggerType: 'SCHEDULED',
          scheduledFor,
        });
        await new ScheduleExecutionKeysRepository(tx).create({
          scheduleId: schedule.id,
          scheduledFor,
          jobRunId: job.id,
        });
      }),
    ).rejects.toBeInstanceOf(UniqueConstraintError);

    expect(await jobRuns.listBySchedule(schedule.id)).toHaveLength(1);
    expect(await keys.getByScheduleAndTime(schedule.id, scheduledFor)).toMatchObject({
      jobRunId: first.id,
    });
  });

  it('truncates oversized log lines', async () => {
    const { project, schedule } = await createProjectAndSchedule();
    const job = await new JobRunsRepository(database.db).create({
      scheduleId: schedule.id,
      projectId: project.id,
      priority: 3,
      dbtCommand: 'build',
    });
    const logs = new JobLogsRepository(database.db);
    const result = await logs.append(job.id, [
      { stream: 'stdout', message: 'x'.repeat(MAX_JOB_LOG_MESSAGE_CHARS + 50) },
    ]);
    expect(result.inserted[0]?.message.length).toBe(MAX_JOB_LOG_MESSAGE_CHARS);
    expect(result.inserted[0]?.message).toContain('[truncated]');
  });

  it('registers workers idempotently by name', async () => {
    const workers = new WorkersRepository(database.db);
    const first = await workers.register({
      workerName: 'worker-01',
      hostname: 'host-a',
      concurrency: 2,
    });
    const second = await workers.register({
      workerName: 'worker-01',
      hostname: 'host-b',
      concurrency: 4,
    });
    expect(second.id).toBe(first.id);
    expect(second.hostname).toBe('host-b');
    expect(second.concurrency).toBe(4);
    expect(await workers.list()).toHaveLength(1);
  });

  it('stores job dependencies for later DAG use', async () => {
    const { project, schedule } = await createProjectAndSchedule();
    const jobRuns = new JobRunsRepository(database.db);
    const upstream = await jobRuns.create({
      scheduleId: schedule.id,
      projectId: project.id,
      priority: 3,
      dbtCommand: 'run',
    });
    const downstream = await jobRuns.create({
      scheduleId: schedule.id,
      projectId: project.id,
      priority: 3,
      dbtCommand: 'test',
    });
    const dependencies = new JobDependenciesRepository(database.db);
    await dependencies.create({
      jobRunId: downstream.id,
      dependsOnJobRunId: upstream.id,
    });
    const listed = await dependencies.listByJobRun(downstream.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.dependsOnJobRunId).toBe(upstream.id);
  });

  it('claims distinct queued jobs inside SKIP LOCKED transactions', async () => {
    const { project, schedule } = await createProjectAndSchedule();
    const jobs = new JobRunsRepository(database.db);
    const first = await jobs.create({
      scheduleId: schedule.id,
      projectId: project.id,
      priority: 2,
      dbtCommand: 'build',
    });
    const second = await jobs.create({
      scheduleId: schedule.id,
      projectId: project.id,
      priority: 3,
      dbtCommand: 'build',
    });
    const now = new Date('2026-08-26T18:00:00.000Z');
    const lease = new Date(now.getTime() + 60_000);

    const claimedFirst = await withTransaction(database.db, (tx) =>
      new JobRunsRepository(tx).lockAndClaimNextQueued({
        workerId: '11111111-1111-4111-8111-111111111111',
        now,
        leaseExpiresAt: lease,
      }),
    );
    const claimedSecond = await withTransaction(database.db, (tx) =>
      new JobRunsRepository(tx).lockAndClaimNextQueued({
        workerId: '22222222-2222-4222-8222-222222222222',
        now,
        leaseExpiresAt: lease,
      }),
    );

    expect(claimedFirst?.id).toBe(first.id);
    expect(claimedFirst?.status).toBe('RUNNING');
    expect(claimedSecond?.id).toBe(second.id);
    expect(claimedSecond?.status).toBe('RUNNING');
    const claimedThird = await withTransaction(database.db, (tx) =>
      new JobRunsRepository(tx).lockAndClaimNextQueued({
        workerId: '33333333-3333-4333-8333-333333333333',
        now,
        leaseExpiresAt: lease,
      }),
    );
    expect(claimedThird).toBeUndefined();
  });

  it('lists enabled due schedules with timezone-aware timestamps', async () => {
    const { schedules, schedule } = await createProjectAndSchedule();
    const due = await schedules.listEnabledDue(new Date('2026-08-26T15:00:00.000Z'));
    expect(due.map((item) => item.id)).toContain(schedule.id);
    expect(schedule.nextRunAt?.toISOString()).toBe('2026-08-26T15:00:00.000Z');
  });
});
