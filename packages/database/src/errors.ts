import { DatabaseError, UniqueConstraintError } from '@dbt-scheduler/types';

const CONNECTION_STRING = /postgres(?:ql)?:\/\/\S+/gi;

export function redactDatabaseErrorMessage(message: string): string {
  return message.replace(CONNECTION_STRING, 'postgres://[redacted]');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (isRecord(current) && !seen.has(current)) {
    seen.add(current);
    if (current.code === '23505') {
      return true;
    }
    if (
      typeof current.message === 'string' &&
      /duplicate key|unique constraint/i.test(current.message)
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

export function wrapDatabaseError(error: unknown, message: string): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }
  const causeMessage =
    error instanceof Error ? redactDatabaseErrorMessage(error.message) : 'unknown database error';
  const options = { cause: error, details: { causeMessage } };
  if (isUniqueViolation(error)) {
    return new UniqueConstraintError(message, options);
  }
  return new DatabaseError(message, options);
}
