import { loadConfig } from '@dbt-scheduler/config';
import { createTestDatabase, type TestDatabase } from '@dbt-scheduler/database/testing';
import { createLogger } from '@dbt-scheduler/logging';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSchedulerProcess } from './process.js';

describe('scheduler process', () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  it('starts without creating jobs on an empty queue and waits for shutdown', async () => {
    const logger = createLogger({ name: 'scheduler-test', level: 'silent' });
    const info = vi.spyOn(logger, 'info');
    const config = loadConfig({
      DATABASE_URL: 'postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler',
      PROCESS_ROLE: 'scheduler',
    });

    await runSchedulerProcess({
      config,
      logger,
      db: database.db,
      waitForShutdown: async () => 'SIGTERM',
      pollIntervalMs: 10,
      sleep: async () => undefined,
    });

    const events = info.mock.calls.map((call) => {
      const payload = call[0];
      return typeof payload === 'object' && payload !== null && 'event' in payload
        ? String(payload.event)
        : undefined;
    });
    expect(events).toContain('process_started');
    expect(events).toContain('shutdown_requested');
    expect(events).not.toContain('job_created');
  });
});
