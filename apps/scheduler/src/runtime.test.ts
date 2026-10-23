import { loadConfig, type AppConfig } from '@dbt-scheduler/config';
import {
  JobRunsRepository,
  ProjectsRepository,
  ScheduleExecutionKeysRepository,
  SchedulesRepository,
} from '@dbt-scheduler/database';
import { createTestDatabase, type TestDatabase } from '@dbt-scheduler/database/testing';
import { getCommitSha, runGit } from '@dbt-scheduler/git-manager';
import { createLogger } from '@dbt-scheduler/logging';
import { JOB_PRIORITIES, type ProjectSourceMode } from '@dbt-scheduler/types';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SchedulerRuntime } from './runtime.js';

async function createOrigin(root: string, branch = 'main'): Promise<string> {
  const origin = path.join(root, 'origin.git');
  await mkdir(origin, { recursive: true });
  const git = (args: string[]) => runGit({ args, cwd: origin, timeoutMs: 30_000 });
  await git(['init', '-b', branch]);
  await git(['config', 'user.email', 'scheduler@example.test']);
  await git(['config', 'user.name', 'DBT Scheduler Tests']);
  await writeFile(path.join(origin, 'README.md'), 'origin\n', 'utf8');
  await git(['add', 'README.md']);
  await git(['commit', '-m', 'initial']);
  return origin;
}

describe('SchedulerRuntime', { timeout: 30_000 }, () => {
  let database: TestDatabase;
  let config: AppConfig;
  let root: string;
  const now = new Date('2026-08-26T15:00:00.000Z');

  beforeEach(async () => {
    database = await createTestDatabase();
    root = await mkdtemp(path.join(tmpdir(), 'scheduler-runtime-'));
    config = loadConfig({
      DATABASE_URL: 'postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler',
      PROCESS_ROLE: 'scheduler',
    });
  });

  afterEach(async () => {
    await database.close();
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  });

  function runtime(): SchedulerRuntime {
    return new SchedulerRuntime({
      config,
      db: database.db,
      logger: createLogger({ name: 'scheduler-runtime-test', level: 'silent' }),
      now: () => now,
      pollIntervalMs: 10,
      sleep: async () => undefined,
    });
  }

  async function seed(overrides?: {
    enabled?: boolean;
    nextRunAt?: Date | null;
    concurrencyPolicy?: 'SKIP_IF_RUNNING' | 'QUEUE' | 'ALLOW';
    cronExpression?: string;
    timezone?: string;
    name?: string;
    repositoryUrl?: string;
    sourceMode?: ProjectSourceMode;
    pollForChanges?: boolean;
    lastSeenCommitSha?: string | null;
  }) {
    const project = await new ProjectsRepository(database.db).create({
      name: 'analytics',
      repositoryUrl: overrides?.repositoryUrl ?? 'https://github.com/example/analytics-dbt.git',
      branch: 'main',
      ...(overrides?.sourceMode === undefined ? {} : { sourceMode: overrides.sourceMode }),
    });
    const schedule = await new SchedulesRepository(database.db).create({
      projectId: project.id,
      name: overrides?.name ?? 'hourly-build',
      cronExpression: overrides?.cronExpression ?? '0 * * * *',
      timezone: overrides?.timezone ?? 'UTC',
      dbtCommand: 'build',
      priority: JOB_PRIORITIES.NORMAL,
      enabled: overrides?.enabled ?? true,
      concurrencyPolicy: overrides?.concurrencyPolicy ?? 'QUEUE',
      ...(overrides?.pollForChanges === undefined
        ? {}
        : { pollForChanges: overrides.pollForChanges }),
      ...(overrides?.lastSeenCommitSha === undefined
        ? {}
        : { lastSeenCommitSha: overrides.lastSeenCommitSha }),
      ...(overrides?.nextRunAt === undefined
        ? { nextRunAt: new Date('2026-08-26T15:00:00.000Z') }
        : { nextRunAt: overrides.nextRunAt }),
    });
    return { project, schedule };
  }

  it('creates a job for a due schedule and advances next_run_at', async () => {
    const { schedule } = await seed();
    const summary = await runtime().tick();
    expect(summary.jobsCreated).toBe(1);

    const jobs = await new JobRunsRepository(database.db).listBySchedule(schedule.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.triggerType).toBe('SCHEDULED');
    expect(jobs[0]?.scheduledFor?.toISOString()).toBe('2026-08-26T15:00:00.000Z');
    expect(jobs[0]?.idempotencyKey).toBe(`${schedule.id}:2026-08-26T15:00:00.000Z`);

    const key = await new ScheduleExecutionKeysRepository(database.db).getByScheduleAndTime(
      schedule.id,
      new Date('2026-08-26T15:00:00.000Z'),
    );
    expect(key?.jobRunId).toBe(jobs[0]?.id);

    const updated = await new SchedulesRepository(database.db).getById(schedule.id);
    expect(updated?.nextRunAt?.toISOString()).toBe('2026-08-26T16:00:00.000Z');
    expect(updated?.lastRunAt?.toISOString()).toBe(now.toISOString());
  });

  it('does not create a second job for the same scheduled_for', async () => {
    const { schedule } = await seed();
    const scheduler = runtime();
    await scheduler.tick();
    await new SchedulesRepository(database.db).update(schedule.id, {
      nextRunAt: new Date('2026-08-26T15:00:00.000Z'),
    });
    const summary = await scheduler.tick();
    expect(summary.jobsCreated).toBe(0);
    expect(await new JobRunsRepository(database.db).listBySchedule(schedule.id)).toHaveLength(1);
    const updated = await new SchedulesRepository(database.db).getById(schedule.id);
    expect(updated?.nextRunAt?.toISOString()).toBe('2026-08-26T16:00:00.000Z');
  });

  it('skips enqueue when SKIP_IF_RUNNING but still consumes the slot', async () => {
    const { schedule } = await seed({ concurrencyPolicy: 'SKIP_IF_RUNNING' });
    const scheduler = runtime();
    await scheduler.tick();
    await new SchedulesRepository(database.db).update(schedule.id, {
      nextRunAt: new Date('2026-08-26T16:00:00.000Z'),
    });
    const later = new SchedulerRuntime({
      config,
      db: database.db,
      logger: createLogger({ name: 'scheduler-runtime-test', level: 'silent' }),
      now: () => new Date('2026-08-26T16:00:00.000Z'),
      pollIntervalMs: 10,
      sleep: async () => undefined,
    });
    const summary = await later.tick();
    expect(summary.jobsCreated).toBe(0);
    expect(summary.jobsSkipped).toBe(1);
    expect(await new JobRunsRepository(database.db).listBySchedule(schedule.id)).toHaveLength(1);
    const updated = await new SchedulesRepository(database.db).getById(schedule.id);
    expect(updated?.nextRunAt?.toISOString()).toBe('2026-08-26T17:00:00.000Z');
  });

  it('ignores disabled schedules', async () => {
    await seed({ enabled: false });
    const summary = await runtime().tick();
    expect(summary.jobsCreated).toBe(0);
  });

  it('initializes next_run_at without creating a job', async () => {
    const { schedule } = await seed({ nextRunAt: null });
    const summary = await runtime().tick();
    expect(summary.jobsCreated).toBe(0);
    expect(summary.schedulesInitialized).toBe(1);
    const updated = await new SchedulesRepository(database.db).getById(schedule.id);
    expect(updated?.nextRunAt?.toISOString()).toBe('2026-08-26T16:00:00.000Z');
  });

  it('catches up missed hours with a single job', async () => {
    const { schedule } = await seed({
      nextRunAt: new Date('2026-08-26T10:00:00.000Z'),
    });
    const summary = await runtime().tick();
    expect(summary.jobsCreated).toBe(1);
    const jobs = await new JobRunsRepository(database.db).listBySchedule(schedule.id);
    expect(jobs[0]?.scheduledFor?.toISOString()).toBe('2026-08-26T10:00:00.000Z');
    const updated = await new SchedulesRepository(database.db).getById(schedule.id);
    expect(updated?.nextRunAt?.toISOString()).toBe('2026-08-26T16:00:00.000Z');
  });

  it('computes next_run_at in the schedule timezone', async () => {
    const { schedule } = await seed({
      cronExpression: '0 9 * * *',
      timezone: 'America/New_York',
      nextRunAt: new Date('2026-08-26T13:00:00.000Z'),
    });
    const eastern = new SchedulerRuntime({
      config,
      db: database.db,
      logger: createLogger({ name: 'scheduler-runtime-test', level: 'silent' }),
      now: () => new Date('2026-08-26T13:00:00.000Z'),
      pollIntervalMs: 10,
      sleep: async () => undefined,
    });
    await eastern.tick();
    const updated = await new SchedulesRepository(database.db).getById(schedule.id);
    expect(updated?.nextRunAt?.toISOString()).toBe('2026-08-27T13:00:00.000Z');
  });

  it('does not fail the tick when one schedule has an invalid cron', async () => {
    const { project } = await seed();
    await new SchedulesRepository(database.db).create({
      projectId: project.id,
      name: 'broken',
      cronExpression: 'not-a-cron',
      timezone: 'UTC',
      dbtCommand: 'build',
      enabled: true,
      nextRunAt: new Date('2026-08-26T15:00:00.000Z'),
    });
    const summary = await runtime().tick();
    expect(summary.jobsCreated).toBe(1);
  });

  describe('pollForChanges', () => {
    it('does not enqueue when the polled commit matches lastSeenCommitSha, but still advances next_run_at', async () => {
      const origin = await createOrigin(root);
      const sha = await getCommitSha({ cwd: origin, timeoutMs: 30_000 });
      const { schedule } = await seed({
        repositoryUrl: origin,
        sourceMode: 'git',
        pollForChanges: true,
        lastSeenCommitSha: sha,
      });

      const summary = await runtime().tick();
      expect(summary.jobsCreated).toBe(0);
      expect(summary.schedulesPolledUnchanged).toBe(1);
      expect(await new JobRunsRepository(database.db).listBySchedule(schedule.id)).toHaveLength(0);

      const updated = await new SchedulesRepository(database.db).getById(schedule.id);
      expect(updated?.nextRunAt?.toISOString()).toBe('2026-08-26T16:00:00.000Z');
      expect(updated?.lastSeenCommitSha).toBe(sha);
    });

    it('enqueues a GIT_CHANGE job on first poll when lastSeenCommitSha is null', async () => {
      const origin = await createOrigin(root);
      const sha = await getCommitSha({ cwd: origin, timeoutMs: 30_000 });
      const { schedule } = await seed({
        repositoryUrl: origin,
        sourceMode: 'git',
        pollForChanges: true,
      });

      const summary = await runtime().tick();
      expect(summary.jobsCreated).toBe(1);
      expect(summary.schedulesPolledUnchanged).toBe(0);

      const jobs = await new JobRunsRepository(database.db).listBySchedule(schedule.id);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.triggerType).toBe('GIT_CHANGE');

      const updated = await new SchedulesRepository(database.db).getById(schedule.id);
      expect(updated?.lastSeenCommitSha).toBe(sha);
    });

    it('enqueues a GIT_CHANGE job when the commit changed, and updates lastSeenCommitSha', async () => {
      const origin = await createOrigin(root);
      const firstSha = await getCommitSha({ cwd: origin, timeoutMs: 30_000 });
      await writeFile(path.join(origin, 'README.md'), 'updated\n', 'utf8');
      await runGit({ args: ['add', 'README.md'], cwd: origin, timeoutMs: 30_000 });
      await runGit({ args: ['commit', '-m', 'update'], cwd: origin, timeoutMs: 30_000 });
      const secondSha = await getCommitSha({ cwd: origin, timeoutMs: 30_000 });
      expect(secondSha).not.toBe(firstSha);

      const { schedule } = await seed({
        repositoryUrl: origin,
        sourceMode: 'git',
        pollForChanges: true,
        lastSeenCommitSha: firstSha,
      });

      const summary = await runtime().tick();
      expect(summary.jobsCreated).toBe(1);

      const jobs = await new JobRunsRepository(database.db).listBySchedule(schedule.id);
      expect(jobs[0]?.triggerType).toBe('GIT_CHANGE');

      const updated = await new SchedulesRepository(database.db).getById(schedule.id);
      expect(updated?.lastSeenCommitSha).toBe(secondSha);
    });

    it('does not enqueue and does not fail the tick when the git poll errors', async () => {
      const missing = path.join(root, 'does-not-exist');
      const { schedule } = await seed({
        repositoryUrl: missing,
        sourceMode: 'git',
        pollForChanges: true,
      });

      const summary = await runtime().tick();
      expect(summary.jobsCreated).toBe(0);
      expect(summary.schedulesPolledUnchanged).toBe(0);
      expect(await new JobRunsRepository(database.db).listBySchedule(schedule.id)).toHaveLength(0);

      const updated = await new SchedulesRepository(database.db).getById(schedule.id);
      expect(updated?.nextRunAt?.toISOString()).toBe('2026-08-26T16:00:00.000Z');
      expect(updated?.lastSeenCommitSha).toBeNull();
    });

    it('does not enqueue for pollForChanges schedules on local_directory projects', async () => {
      const { schedule } = await seed({
        repositoryUrl: root,
        sourceMode: 'local_directory',
        pollForChanges: true,
      });

      const summary = await runtime().tick();
      expect(summary.jobsCreated).toBe(0);
      expect(summary.schedulesPolledUnchanged).toBe(0);
      expect(await new JobRunsRepository(database.db).listBySchedule(schedule.id)).toHaveLength(0);
    });
  });
});
