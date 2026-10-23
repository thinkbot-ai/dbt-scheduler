import type { FastifyInstance } from 'fastify';
import {
  idParamsSchema,
  listJobsQuerySchema,
  listLogsQuerySchema,
} from '@dbt-scheduler/validation';
import { parseRequest } from '../http/parse.js';
import type { JobService } from '../services/jobs.js';

export function registerJobRoutes(app: FastifyInstance, jobs: JobService): void {
  app.get('/api/jobs', async (request) => {
    const query = parseRequest(listJobsQuerySchema, request.query, 'Invalid job query');
    return { data: await jobs.list(query) };
  });

  app.get('/api/jobs/:id', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params, 'Invalid job id');
    return { data: await jobs.get(id) };
  });

  app.get('/api/jobs/:id/logs', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params, 'Invalid job id');
    const query = parseRequest(listLogsQuerySchema, request.query, 'Invalid log query');
    return { data: await jobs.logs(id, query) };
  });

  app.post('/api/jobs/:id/cancel', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params, 'Invalid job id');
    return { data: await jobs.cancel(id) };
  });
}
