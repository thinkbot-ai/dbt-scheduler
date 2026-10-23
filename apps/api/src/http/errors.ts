import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
  NotFoundError,
  QueueError,
  SchedulerError,
  UniqueConstraintError,
  ValidationError,
} from '@dbt-scheduler/types';

export function mapErrorToResponse(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
} {
  if (error instanceof ValidationError) {
    return {
      statusCode: 400,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }
  if (error instanceof NotFoundError) {
    return { statusCode: 404, code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof UniqueConstraintError) {
    return { statusCode: 409, code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof QueueError) {
    const statusCode = error.message.includes('not found') ? 404 : 409;
    return { statusCode, code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof SchedulerError) {
    return { statusCode: 400, code: error.code, message: error.message, details: error.details };
  }
  const fastifyError = error as FastifyError;
  if (typeof fastifyError.statusCode === 'number' && fastifyError.statusCode >= 400) {
    return {
      statusCode: fastifyError.statusCode,
      code: fastifyError.statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
      message:
        fastifyError.statusCode >= 500
          ? 'An unexpected error occurred'
          : (fastifyError.message ?? 'Request failed'),
    };
  }
  return { statusCode: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };
}

export function sendMappedError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const mapped = mapErrorToResponse(error);
  if (mapped.statusCode >= 500) {
    request.log.error({ err: error, event: 'request_failed' }, mapped.message);
  } else {
    request.log.warn({ err: error, event: 'request_rejected', code: mapped.code }, mapped.message);
  }
  void reply.status(mapped.statusCode).send({
    error: {
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details === undefined || Object.keys(mapped.details).length === 0
        ? {}
        : { details: mapped.details }),
    },
  });
}
