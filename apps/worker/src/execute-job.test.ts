import { loadConfig, type AppConfig } from '@dbt-scheduler/config';
import {
  JobRunsRepository,
  ProjectsRepository,
  SchedulesRepository,
} from '@dbt-scheduler/database';
import { createTestDatabase, type TestDatabase } from '@dbt-scheduler/database/testing';
import type { DbtExecutionResult, RunDbtOptions } from '@dbt-scheduler/dbt-runner';
import { createLogger } from '@dbt-scheduler/logging';
import { JOB_PRIORITIES } from '@dbt-scheduler/types';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeClaimedJob } from './execute-job.js';

describe('executeClaimedJob (local_directory source mode)', { timeout: 30_000 }, () => {
  let database: TestDatabase;
  let config: AppConfig;
  let root: string;

  beforeEach(async () => {
    database = await createTestDatabase();
    root = await mkdtemp(path.join(tmpdir(), 'execute-job-local-'));
    config = loadConfig({
      DATABASE_URL: 'postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler',
      PROCESS_ROLE: 'worker',
      WORKSPACE_ROOT: 'C:/tmp/dbt-scheduler-workspaces',
    });
  });

  afterEach(async () => {
    await database.close();
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  });

  async function seed(overrides: { repositoryUrl?: string; projectPath?: string } = {}) {
    const project = await new ProjectsRepository(database.db).create({
      name: 'local-analytics',
      repositoryUrl: overrides.repositoryUrl ?? root,
      sourceMode: 'local_directory',
      projectPath: overrides.projectPath ?? '.',
    });
    const schedule = await new SchedulesRepository(database.db).create({
      projectId: project.id,
      name: 'debug-schedule',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      dbtCommand: 'debug',
      runDbtDeps: false,
    });
    const job = await new JobRunsRepository(database.db).create({
      scheduleId: schedule.id,
      projectId: project.id,
      priority: JOB_PRIORITIES.NORMAL,
      dbtCommand: 'debug',
      dbtArguments: [],
    });
    return { project, schedule, job };
  }

  it('runs dbt directly in the local folder without cloning', async () => {
    const { job } = await seed();
    let capturedCwd: string | undefined;
    let prepareRepositoryCalled = false;

    const result = await executeClaimedJob({
      job,
      db: database.db,
      config,
      logger: createLogger({ name: 'execute-job-test', level: 'silent' }),
      signal: new AbortController().signal,
      prepareRepository: async () => {
        prepareRepositoryCalled = true;
        throw new Error('prepareRepository must not be called in local_directory mode');
      },
      runDbt: async (options: RunDbtOptions) => {
        capturedCwd = options.cwd;
        return fakeDbtResult({ succeeded: true, status: 'SUCCESS', exitCode: 0 });
      },
    });

    expect(prepareRepositoryCalled).toBe(false);
    expect(result.outcome).toBe('SUCCESS');
    expect(capturedCwd).toBe(path.resolve(root));

    const stored = await new JobRunsRepository(database.db).getById(job.id);
    expect(stored?.commitSha).toBeNull();
    expect(stored?.branch).toBeNull();
    expect(stored?.repositoryUrl).toBe(root);
  });

  it('fails with CONFIGURATION_FAILURE when the local folder does not exist', async () => {
    const missing = path.join(root, 'does-not-exist');
    const { job } = await seed({ repositoryUrl: missing });

    const result = await executeClaimedJob({
      job,
      db: database.db,
      config,
      logger: createLogger({ name: 'execute-job-test', level: 'silent' }),
      signal: new AbortController().signal,
      runDbt: async () => fakeDbtResult({ succeeded: true, status: 'SUCCESS', exitCode: 0 }),
    });

    expect(result.outcome).toBe('FAILED');
    expect(result.failureClass).toBe('CONFIGURATION_FAILURE');
  });

  it('fails with CONFIGURATION_FAILURE when projectPath escapes the local folder', async () => {
    const { job } = await seed({ projectPath: '..' });

    const result = await executeClaimedJob({
      job,
      db: database.db,
      config,
      logger: createLogger({ name: 'execute-job-test', level: 'silent' }),
      signal: new AbortController().signal,
      runDbt: async () => fakeDbtResult({ succeeded: true, status: 'SUCCESS', exitCode: 0 }),
    });

    expect(result.outcome).toBe('FAILED');
    expect(result.failureClass).toBe('CONFIGURATION_FAILURE');
  });
});

function fakeDbtResult(
  overrides: Partial<DbtExecutionResult> & Pick<DbtExecutionResult, 'status' | 'succeeded'>,
): DbtExecutionResult {
  return {
    bin: 'dbt',
    argv: ['debug'],
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
