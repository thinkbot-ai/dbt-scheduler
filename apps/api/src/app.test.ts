import { loadConfig } from '@dbt-scheduler/config';
import { createLogger } from '@dbt-scheduler/logging';
import { describe, expect, it } from 'vitest';
import { buildApi } from './app.js';

describe('GET /api/health', () => {
  const config = loadConfig({
    DATABASE_URL: 'postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler',
    NODE_ENV: 'test',
  });
  const logger = createLogger({ name: 'api-test', level: 'silent' });

  it('returns liveness status without querying the database', async () => {
    const app = await buildApi({ config, logger });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string; role: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.role).toBe('api');
    expect(body.service).toBe('dbt-scheduler');
  });
});
