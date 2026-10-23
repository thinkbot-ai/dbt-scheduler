import type { FastifyInstance } from 'fastify';
import {
  createProjectBodySchema,
  idParamsSchema,
  updateProjectBodySchema,
} from '@dbt-scheduler/validation';
import { parseRequest } from '../http/parse.js';
import type { ProjectService } from '../services/projects.js';

export function registerProjectRoutes(app: FastifyInstance, projects: ProjectService): void {
  app.get('/api/projects', async () => ({ data: await projects.list() }));

  app.post('/api/projects', async (request, reply) => {
    const body = parseRequest(createProjectBodySchema, request.body, 'Invalid project');
    const project = await projects.create(body);
    return reply.status(201).send({ data: project });
  });

  app.get('/api/projects/:id', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params, 'Invalid project id');
    return { data: await projects.get(id) };
  });

  app.put('/api/projects/:id', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params, 'Invalid project id');
    const body = parseRequest(updateProjectBodySchema, request.body, 'Invalid project update');
    return { data: await projects.update(id, body) };
  });

  app.delete('/api/projects/:id', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params, 'Invalid project id');
    await projects.delete(id);
    return reply.status(204).send();
  });
}
