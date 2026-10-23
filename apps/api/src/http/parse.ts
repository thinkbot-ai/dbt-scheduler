import { ValidationError } from '@dbt-scheduler/types';
import type { z } from 'zod';

export function parseRequest<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  message: string,
): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(message, {
      details: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
  }
  return parsed.data;
}
