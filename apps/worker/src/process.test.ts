import { loadConfig } from '@dbt-scheduler/config';
import { createTestDatabase, type TestDatabase } from '@dbt-scheduler/database/testing';
import { createLogger } from '@dbt-scheduler/logging';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWorkerProcess } from './process.js';

describe('worker process', () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  it('registers, idles with an empty queue, and shuts down', async () => {
    const logger = createLogger({ name: 'worker-test', level: 'silent' });
    const info = vi.spyOn(logger, 'info');
    const config = loadConfig({
      DATABASE_URL: 'postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler',
      PROCESS_ROLE: 'worker',
      WORKSPACE_ROOT: 'C:/tmp/dbt-scheduler-workspaces',
    });

    await runWorkerProcess({
      config,
      logger,
      db: database.db,
      hostname: 'test-host',
      workerName: 'worker-test-1',
      waitForShutdown: async () => 'SIGTERM',
      pollIntervalMs: 10,
      sleep: async () => undefined,
      prepareRepository: async () => {
        throw new Error('prepare should not run on an empty queue');
      },
      runDbt: async () => {
        throw new Error('dbt should not run on an empty queue');
      },
      cleanupWorkspaces: async () => ({ removed: [], kept: [] }),
    });

    const events = info.mock.calls.map((call) => {
      const payload = call[0];
      return typeof payload === 'object' && payload !== null && 'event' in payload
        ? String(payload.event)
        : undefined;
    });
    expect(events).toContain('worker_registered');
    expect(events).toContain('process_started');
    expect(events).toContain('shutdown_requested');
    expect(events).not.toContain('job_claimed');
  });
});
