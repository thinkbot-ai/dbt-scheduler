import cors from '@fastify/cors';
import type { AppConfig } from '@dbt-scheduler/config';
import type { Database } from '@dbt-scheduler/database';
import { JobQueue } from '@dbt-scheduler/job-queue';
import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import Fastify from 'fastify';
import type { Logger } from '@dbt-scheduler/logging';
import { registerAuth } from './http/auth.js';
import { sendMappedError } from './http/errors.js';
import { registerJobRoutes } from './routes/jobs.js';
import { registerHealthRoute } from './routes/health.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerScheduleRoutes } from './routes/schedules.js';
import { registerWorkerAndStatusRoutes } from './routes/system.js';
import { JobService } from './services/jobs.js';
import { ProjectService } from './services/projects.js';
import { ScheduleService } from './services/schedules.js';
import { StatusService } from './services/status.js';

export interface ApiDependencies {
  config: AppConfig;
  logger: Logger;
  db?: Database;
}

export async function buildApi(
  deps: ApiDependencies,
  options: FastifyServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: deps.logger,
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      if (typeof header === 'string' && header.length > 0) {
        return header;
      }
      return crypto.randomUUID();
    },
    requestIdHeader: 'x-request-id',
    ...options,
  });

  await app.register(cors, {
    origin: deps.config.WEB_ORIGIN,
  });

  registerAuth(app, deps.config);
  registerHealthRoute(app);

  if (deps.db) {
    const queue = new JobQueue(deps.db, {
      leaseSeconds: deps.config.JOB_LEASE_SECONDS,
      maxConcurrentJobs: deps.config.MAX_CONCURRENT_JOBS,
    });
    registerProjectRoutes(app, new ProjectService(deps.db));
    registerScheduleRoutes(app, new ScheduleService(deps.db, queue));
    registerJobRoutes(app, new JobService(deps.db, queue));
    registerWorkerAndStatusRoutes(app, new StatusService(deps.db), deps.config);
  }

  app.setErrorHandler((error, request, reply) => {
    sendMappedError(error, request, reply);
  });

  return app;
}
