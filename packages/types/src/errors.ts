export class SchedulerError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    message: string,
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.details = options?.details ?? {};
  }
}

export class ConfigurationError extends SchedulerError {
  constructor(message: string, options?: { cause?: unknown; details?: Record<string, unknown> }) {
    super('CONFIGURATION_ERROR', message, options);
  }
}

export class ValidationError extends SchedulerError {
  constructor(message: string, options?: { cause?: unknown; details?: Record<string, unknown> }) {
    super('VALIDATION_ERROR', message, options);
  }
}

export class GitError extends SchedulerError {
  constructor(message: string, options?: { cause?: unknown; details?: Record<string, unknown> }) {
    super('GIT_ERROR', message, options);
  }
}

export class DbtError extends SchedulerError {
  constructor(message: string, options?: { cause?: unknown; details?: Record<string, unknown> }) {
    super('DBT_ERROR', message, options);
  }
}

export class WorkerError extends SchedulerError {
  constructor(message: string, options?: { cause?: unknown; details?: Record<string, unknown> }) {
    super('WORKER_ERROR', message, options);
  }
}

export class QueueError extends SchedulerError {
  constructor(message: string, options?: { cause?: unknown; details?: Record<string, unknown> }) {
    super('QUEUE_ERROR', message, options);
  }
}

export class DatabaseError extends SchedulerError {
  constructor(message: string, options?: { cause?: unknown; details?: Record<string, unknown> }) {
    super('DATABASE_ERROR', message, options);
  }
}

export class UniqueConstraintError extends DatabaseError {
  constructor(message: string, options?: { cause?: unknown; details?: Record<string, unknown> }) {
    super(message, options);
  }
}

export class NotFoundError extends SchedulerError {
  constructor(message: string, options?: { cause?: unknown; details?: Record<string, unknown> }) {
    super('NOT_FOUND', message, options);
  }
}

export class CancellationError extends SchedulerError {
  constructor(message: string, options?: { cause?: unknown; details?: Record<string, unknown> }) {
    super('CANCELLATION_ERROR', message, options);
  }
}
