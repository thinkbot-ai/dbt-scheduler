import type { AppConfig } from '@dbt-scheduler/config';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

export function registerAuth(app: FastifyInstance, config: AppConfig): void {
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? request.url;
    if (path === '/api/health') {
      return;
    }
    const expected = config.API_AUTH_TOKEN;
    if (expected === undefined) {
      return;
    }
    const header = request.headers.authorization;
    const provided =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice('Bearer '.length)
        : undefined;
    if (provided === undefined || !secureEqual(provided, expected)) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }
  });
}

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
