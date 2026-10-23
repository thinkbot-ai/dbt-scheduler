import type { FastifyInstance } from 'fastify';
import {
  createScheduleBodySchema,
  idParamsSchema,
  listSchedulesQuerySchema,
  runScheduleBodySchema,
  updateScheduleBodySchema,
} from '@dbt-scheduler/validation';
import { parseRequest } from '../http/parse.js';
import type { ScheduleService } from '../services/schedules.js';

export function registerScheduleRoutes(app: FastifyInstance, schedules: ScheduleService): void {
  app.get('/api/schedules', async (request) => {
    const query = parseRequest(listSchedulesQuerySchema, request.query, 'Invalid schedule query');
    return { data: await schedules.list(query.projectId) };
  });

  app.post('/api/schedules', async (request, reply) => {
    const body = parseRequest(createScheduleBodySchema, request.body, 'Invalid schedule');
    const schedule = await schedules.create(body);
    return reply.status(201).send({ data: schedule });
  });

  app.get('/api/schedules/:id', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params, 'Invalid schedule id');
    return { data: await schedules.get(id) };
  });

  app.put('/api/schedules/:id', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params, 'Invalid schedule id');
    const body = parseRequest(updateScheduleBodySchema, request.body, 'Invalid schedule update');
    return { data: await schedules.update(id, body) };
  });

  app.delete('/api/schedules/:id', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params, 'Invalid schedule id');
    await schedules.delete(id);
    return reply.status(204).send();
  });

  app.post('/api/schedules/:id/run', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params, 'Invalid schedule id');
    const headerKey = request.headers['idempotency-key'];
    const payload = parseRequest(runScheduleBodySchema, request.body ?? {}, 'Invalid run request');
    const idempotencyKey =
      payload.idempotencyKey ?? (typeof headerKey === 'string' ? headerKey : undefined);
    const result = await schedules.run(id, {
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    });
    const status = result.outcome === 'QUEUED' ? 201 : 200;
    return reply.status(status).send({ data: result });
  });

  app.post('/api/schedules/:id/enable', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params, 'Invalid schedule id');
    return { data: await schedules.setEnabled(id, true) };
  });

  app.post('/api/schedules/:id/disable', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params, 'Invalid schedule id');
    return { data: await schedules.setEnabled(id, false) };
  });
}
