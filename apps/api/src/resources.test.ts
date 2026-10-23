import { loadConfig } from '@dbt-scheduler/config';
import { JobLogsRepository, WorkersRepository } from '@dbt-scheduler/database';
import { createTestDatabase, type TestDatabase } from '@dbt-scheduler/database/testing';
import { createLogger } from '@dbt-scheduler/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApi } from './app.js';

describe('API resources', { timeout: 30_000 }, () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  async function app() {
    const config = loadConfig({
      DATABASE_URL: 'postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler',
      NODE_ENV: 'test',
    });
    const logger = createLogger({ name: 'api-resources-test', level: 'silent' });
    return buildApi({ config, logger, db: database.db });
  }

  it('creates, reads, updates, and deletes a project', async () => {
    const server = await app();
    const created = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'analytics',
        repositoryUrl: 'https://github.com/example/analytics-dbt.git',
        branch: 'main',
        projectPath: '.',
      },
    });
    expect(created.statusCode).toBe(201);
    const project = created.json().data as { id: string; name: string; repositoryUrl: string };
    expect(project.name).toBe('analytics');
    expect(project.repositoryUrl).toContain('github.com');

    const listed = await server.inject({ method: 'GET', url: '/api/projects' });
    expect(listed.json().data).toHaveLength(1);

    const updated = await server.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}`,
      payload: { environment: 'dev' },
    });
    expect(updated.json().data.environment).toBe('dev');

    const removed = await server.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}`,
    });
    expect(removed.statusCode).toBe(204);
    const missing = await server.inject({ method: 'GET', url: `/api/projects/${project.id}` });
    expect(missing.statusCode).toBe(404);
    await server.close();
  });

  it('rejects an unsafe repository URL', async () => {
    const server = await app();
    const response = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'bad', repositoryUrl: 'https://example.com/repo.git; rm -rf /' },
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('creates a local_directory project without a branch and omits it from the response', async () => {
    const server = await app();
    const created = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'local-analytics',
        repositoryUrl: 'C:/tmp/local-analytics',
        sourceMode: 'local_directory',
        projectPath: '.',
      },
    });
    expect(created.statusCode).toBe(201);
    const project = created.json().data as { sourceMode: string; branch: string };
    expect(project.sourceMode).toBe('local_directory');
    await server.close();
  });

  it('rejects local_directory with a non-local repositoryUrl', async () => {
    const server = await app();
    const response = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'bad-local',
        repositoryUrl: 'https://github.com/example/analytics-dbt.git',
        sourceMode: 'local_directory',
      },
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('rejects pollForChanges on a non-git project', async () => {
    const server = await app();
    const projectRes = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'local-poll',
        repositoryUrl: 'C:/tmp/local-poll',
        sourceMode: 'local_directory',
      },
    });
    const projectId = projectRes.json().data.id as string;

    const scheduleRes = await server.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: {
        projectId,
        name: 'poll-schedule',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        dbtCommand: 'build',
        pollForChanges: true,
      },
    });
    expect(scheduleRes.statusCode).toBe(400);
    await server.close();
  });

  it('creates a schedule, runs it now, lists the job, and cancels it', async () => {
    const server = await app();
    const projectRes = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'analytics',
        repositoryUrl: 'https://github.com/example/analytics-dbt.git',
      },
    });
    const projectId = projectRes.json().data.id as string;

    const scheduleRes = await server.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: {
        projectId,
        name: 'hourly-build',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        dbtCommand: 'build',
        concurrencyPolicy: 'QUEUE',
      },
    });
    expect(scheduleRes.statusCode).toBe(201);
    const schedule = scheduleRes.json().data as { id: string; nextRunAt: string };
    expect(schedule.nextRunAt).toBeTruthy();

    const run = await server.inject({
      method: 'POST',
      url: `/api/schedules/${schedule.id}/run`,
      payload: {},
    });
    expect(run.statusCode).toBe(201);
    const jobId = run.json().data.job.id as string;
    expect(run.json().data.outcome).toBe('QUEUED');
    expect(run.json().data.job.triggerType).toBe('MANUAL');

    const jobs = await server.inject({ method: 'GET', url: '/api/jobs?status=QUEUED' });
    expect(jobs.json().data).toHaveLength(1);

    await new JobLogsRepository(database.db).append(jobId, [
      { stream: 'stdout', message: 'Running dbt' },
    ]);
    const logs = await server.inject({ method: 'GET', url: `/api/jobs/${jobId}/logs` });
    expect(logs.json().data[0].message).toContain('Running dbt');

    const cancelled = await server.inject({
      method: 'POST',
      url: `/api/jobs/${jobId}/cancel`,
    });
    expect(cancelled.json().data.status).toBe('CANCELLED');

    await server.inject({ method: 'POST', url: `/api/schedules/${schedule.id}/disable` });
    const disabled = await server.inject({ method: 'GET', url: `/api/schedules/${schedule.id}` });
    expect(disabled.json().data.enabled).toBe(false);

    await server.close();
  });

  it('lists workers and system status', async () => {
    const server = await app();
    await new WorkersRepository(database.db).register({
      workerName: 'worker-a',
      hostname: 'host-a',
    });
    const workers = await server.inject({ method: 'GET', url: '/api/workers' });
    expect(workers.json().data).toHaveLength(1);

    const status = await server.inject({ method: 'GET', url: '/api/system/status' });
    expect(status.json().data.status).toBe('ok');
    expect(status.json().data.workers.total).toBe(1);
    expect(status.json().data.maxConcurrentJobs).toBe(10);
    await server.close();
  });

  it('requires a bearer token when API_AUTH_TOKEN is configured', async () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler',
      NODE_ENV: 'test',
      API_AUTH_TOKEN: 'test-token',
    });
    const logger = createLogger({ name: 'api-auth-test', level: 'silent' });
    const server = await buildApi({ config, logger, db: database.db });

    const health = await server.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);

    const denied = await server.inject({ method: 'GET', url: '/api/projects' });
    expect(denied.statusCode).toBe(401);

    const allowed = await server.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(allowed.statusCode).toBe(200);
    await server.close();
  });
});
