import { loadConfig, type AppConfig } from '@dbt-scheduler/config';
import {
  JobLogsRepository,
  JobRunsRepository,
  ProjectsRepository,
  SchedulesRepository,
  WorkersRepository,
} from '@dbt-scheduler/database';
import { createTestDatabase, type TestDatabase } from '@dbt-scheduler/database/testing';
import type { DbtExecutionResult, RunDbtOptions } from '@dbt-scheduler/dbt-runner';
import type { PreparedJobRepository } from '@dbt-scheduler/git-manager';
import { JobQueue } from '@dbt-scheduler/job-queue';
import { createLogger } from '@dbt-scheduler/logging';
import { JOB_PRIORITIES } from '@dbt-scheduler/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkerRuntime } from './runtime.js';

describe('WorkerRuntime', { timeout: 30_000 }, () => {
  let database: TestDatabase;
  let config: AppConfig;

  beforeEach(async () => {
    database = await createTestDatabase();
    config = loadConfig({
      DATABASE_URL: 'postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler',
      PROCESS_ROLE: 'worker',
      WORKSPACE_ROOT: 'C:/tmp/dbt-scheduler-workspaces',
      WORKER_CONCURRENCY: '2',
      MAX_CONCURRENT_JOBS: '10',
      JOB_LEASE_SECONDS: '60',
    });
  });

  afterEach(async () => {
    await database.close();
  });

  async function seed(overrides?: { maxRetries?: number; runDbtDeps?: boolean }) {
    const project = await new ProjectsRepository(database.db).create({
      name: 'analytics',
      repositoryUrl: 'https://github.com/example/analytics-dbt.git',
      branch: 'main',
      projectPath: '.',
    });
    const schedule = await new SchedulesRepository(database.db).create({
      projectId: project.id,
      name: 'hourly-build',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      dbtCommand: 'build',
      priority: JOB_PRIORITIES.NORMAL,
      concurrencyPolicy: 'QUEUE',
      maxRetries: overrides?.maxRetries ?? 0,
      retryDelaySeconds: 1,
      ...(overrides?.runDbtDeps === undefined ? {} : { runDbtDeps: overrides.runDbtDeps }),
    });
    return { project, schedule };
  }

  function runtime(
    extras: Partial<ConstructorParameters<typeof WorkerRuntime>[0]> & {
      commands?: string[];
      runDbt?: (options: RunDbtOptions) => Promise<DbtExecutionResult>;
    } = {},
  ): WorkerRuntime {
    const commands = extras.commands ?? [];
    return new WorkerRuntime({
      config,
      db: database.db,
      logger: createLogger({ name: 'worker-runtime-test', level: 'silent' }),
      hostname: 'host-a',
      workerName: 'worker-a',
      pollIntervalMs: 10,
      sleep: async () => undefined,
      prepareRepository: async (options) => fakePrepared(options.jobRunId),
      runDbt:
        extras.runDbt ??
        (async (options) => {
          commands.push(options.command);
          return fakeDbtResult({ succeeded: true, status: 'SUCCESS', exitCode: 0 });
        }),
      cleanupWorkspaces: async () => ({ removed: [], kept: [] }),
      ...omit(extras, ['commands', 'runDbt']),
    });
  }

  it('claims a job, records the commit SHA, runs dbt, and marks SUCCESS', async () => {
    const { schedule } = await seed({ runDbtDeps: true });
    const queue = new JobQueue(database.db, { leaseSeconds: 60 });
    await queue.enqueue({ scheduleId: schedule.id });
    const commands: string[] = [];
    const worker = runtime({ commands });
    await worker.start();
    await worker.tick();
    await worker.waitForIdle();

    const jobs = await new JobRunsRepository(database.db).listBySchedule(schedule.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe('SUCCESS');
    expect(jobs[0]?.commitSha).toBe('8f12ab32deadbeef');
    expect(commands).toEqual(['deps', 'build']);

    const logs = await new JobLogsRepository(database.db).listByJobRun(jobs[0]?.id ?? '');
    expect(logs.some((line) => line.stream === 'system' && line.message.includes('git'))).toBe(
      true,
    );
  });

  it('skips dbt deps when the schedule disables them', async () => {
    const { schedule } = await seed({ runDbtDeps: false });
    await new JobQueue(database.db, { leaseSeconds: 60 }).enqueue({ scheduleId: schedule.id });
    const commands: string[] = [];
    const worker = runtime({ commands });
    await worker.start();
    await worker.tick();
    await worker.waitForIdle();
    expect(commands).toEqual(['build']);
  });

  it('does not claim more jobs than WORKER_CONCURRENCY', async () => {
    config = { ...config, WORKER_CONCURRENCY: 1 };
    const { schedule } = await seed();
    const queue = new JobQueue(database.db, { leaseSeconds: 60 });
    await queue.enqueue({ scheduleId: schedule.id });
    await queue.enqueue({ scheduleId: schedule.id });

    let release!: (result: DbtExecutionResult) => void;
    const firstRun = new Promise<DbtExecutionResult>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const worker = runtime({
      runDbt: async () => {
        calls += 1;
        if (calls === 1) {
          return firstRun;
        }
        return fakeDbtResult({ succeeded: true, status: 'SUCCESS', exitCode: 0 });
      },
    });
    await worker.start();
    await worker.tick();
    await worker.tick();

    const running = await new JobRunsRepository(database.db).countByStatuses(['RUNNING']);
    const queued = await new JobRunsRepository(database.db).countByStatuses(['QUEUED']);
    expect(running).toBe(1);
    expect(queued).toBe(1);

    release(fakeDbtResult({ succeeded: true, status: 'SUCCESS', exitCode: 0 }));
    await worker.waitForIdle();
    await worker.stop('SIGTERM');
  });

  it('respects MAX_CONCURRENT_JOBS across workers', async () => {
    config = { ...config, WORKER_CONCURRENCY: 2, MAX_CONCURRENT_JOBS: 1 };
    const { schedule } = await seed();
    const queue = new JobQueue(database.db, { leaseSeconds: 60 });
    await queue.enqueue({ scheduleId: schedule.id });
    await queue.enqueue({ scheduleId: schedule.id });

    let release!: (result: DbtExecutionResult) => void;
    const blocked = new Promise<DbtExecutionResult>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const worker = runtime({
      runDbt: async () => {
        calls += 1;
        if (calls === 1) {
          return blocked;
        }
        return fakeDbtResult({ succeeded: true, status: 'SUCCESS', exitCode: 0 });
      },
    });
    await worker.start();
    await worker.tick();
    await worker.tick();

    expect(await new JobRunsRepository(database.db).countByStatuses(['RUNNING'])).toBe(1);
    expect(await new JobRunsRepository(database.db).countByStatuses(['QUEUED'])).toBe(1);

    release(fakeDbtResult({ succeeded: true, status: 'SUCCESS', exitCode: 0 }));
    await worker.waitForIdle();
    await worker.stop('SIGTERM');
  });

  it('schedules RETRY_WAIT for retryable failures under max attempts', async () => {
    const { schedule } = await seed({ maxRetries: 1 });
    await new JobQueue(database.db, { leaseSeconds: 60 }).enqueue({ scheduleId: schedule.id });
    const worker = runtime({
      runDbt: async () =>
        fakeDbtResult({
          succeeded: false,
          status: 'FAILED',
          exitCode: 1,
          failureClass: 'TRANSIENT_FAILURE',
          errorMessage: 'connection timed out',
        }),
    });
    await worker.start();
    await worker.tick();
    await worker.waitForIdle();

    const jobs = await new JobRunsRepository(database.db).listBySchedule(schedule.id);
    expect(jobs[0]?.status).toBe('RETRY_WAIT');
    expect(jobs[0]?.failureClass).toBe('TRANSIENT_FAILURE');
  });

  it('leaves non-retryable dbt failures as FAILED', async () => {
    const { schedule } = await seed({ maxRetries: 2 });
    await new JobQueue(database.db, { leaseSeconds: 60 }).enqueue({ scheduleId: schedule.id });
    const worker = runtime({
      runDbt: async () =>
        fakeDbtResult({
          succeeded: false,
          status: 'FAILED',
          exitCode: 1,
          failureClass: 'DBT_FAILURE',
          errorMessage: 'dbt exited with code 1',
        }),
    });
    await worker.start();
    await worker.tick();
    await worker.waitForIdle();
    const jobs = await new JobRunsRepository(database.db).listBySchedule(schedule.id);
    expect(jobs[0]?.status).toBe('FAILED');
  });

  it('cancels in-flight work on shutdown', async () => {
    const { schedule } = await seed();
    await new JobQueue(database.db, { leaseSeconds: 60 }).enqueue({ scheduleId: schedule.id });
    const worker = runtime({
      runDbt: async (options) => {
        await waitForAbort(options.signal);
        return fakeDbtResult({
          succeeded: false,
          status: 'CANCELLED',
          cancelled: true,
          exitCode: null,
          failureClass: 'CANCELLED',
          errorMessage: 'Job cancelled',
        });
      },
    });
    await worker.start();
    await worker.tick();
    await worker.stop('SIGTERM');
    const jobs = await new JobRunsRepository(database.db).listBySchedule(schedule.id);
    expect(jobs[0]?.status).toBe('CANCELLED');
    const row = await new WorkersRepository(database.db).getById(worker.workerId);
    expect(row?.status).toBe('STOPPED');
  });

  it('renews the job lease on heartbeat ticks', async () => {
    const { schedule } = await seed();
    await new JobQueue(database.db, { leaseSeconds: 60 }).enqueue({ scheduleId: schedule.id });
    let release!: (result: DbtExecutionResult) => void;
    const blocked = new Promise<DbtExecutionResult>((resolve) => {
      release = resolve;
    });
    const worker = runtime({ runDbt: async () => blocked });
    await worker.start();
    await worker.tick();
    const before = await new JobRunsRepository(database.db).listBySchedule(schedule.id);
    const firstLease = before[0]?.leaseExpiresAt?.getTime();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await worker.tick();
    const after = await new JobRunsRepository(database.db).listBySchedule(schedule.id);
    expect(after[0]?.status).toBe('RUNNING');
    expect(after[0]?.leaseExpiresAt?.getTime()).toBeGreaterThanOrEqual(firstLease ?? 0);

    release(fakeDbtResult({ succeeded: true, status: 'SUCCESS', exitCode: 0 }));
    await worker.waitForIdle();
    await worker.stop('SIGTERM');
  });
});

function fakePrepared(jobRunId: string): PreparedJobRepository {
  return {
    workspacePath: `C:/tmp/dbt-scheduler-workspaces/job-${jobRunId}`,
    repositoryUrl: 'https://github.com/example/analytics-dbt.git',
    branch: 'main',
    commitSha: '8f12ab32deadbeef',
  };
}

function fakeDbtResult(
  overrides: Partial<DbtExecutionResult> & Pick<DbtExecutionResult, 'status' | 'succeeded'>,
): DbtExecutionResult {
  return {
    bin: 'dbt',
    argv: ['build'],
    cwd: 'C:/tmp',
    signal: null,
    startedAt: new Date(),
    finishedAt: new Date(),
    durationMs: 5,
    stdout: '',
    stderr: '',
    outputTruncated: false,
    timedOut: false,
    cancelled: false,
    artifacts: { runResultsFound: false, manifestFound: false, catalogFound: false },
    exitCode: 0,
    ...overrides,
  };
}

function omit<T extends object, K extends keyof T>(value: T, keys: K[]): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) {
    delete copy[key];
  }
  return copy;
}

function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    signal?.addEventListener('abort', () => resolve(), { once: true });
  });
}
