import type { AppConfig } from '@dbt-scheduler/config';
import type { FastifyInstance } from 'fastify';
import type { StatusService } from '../services/status.js';

export function registerWorkerAndStatusRoutes(
  app: FastifyInstance,
  status: StatusService,
  config: AppConfig,
): void {
  app.get('/api/workers', async () => ({ data: await status.workers() }));

  app.get('/api/system/status', async () => ({
    data: await status.system(config.MAX_CONCURRENT_JOBS),
  }));
}
