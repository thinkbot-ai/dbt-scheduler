import { pino, type Logger, type LoggerOptions } from 'pino';

export const SECRET_REDACT_PATHS = [
  'GIT_TOKEN',
  'gitToken',
  'API_AUTH_TOKEN',
  'apiAuthToken',
  'DATABASE_URL',
  'databaseUrl',
  'password',
  'token',
  'secret',
  '*.password',
  '*.token',
  '*.secret',
  '*.GIT_TOKEN',
  'req.headers.authorization',
] as const;

export interface CreateLoggerOptions {
  level?: string;
  name?: string;
  pretty?: boolean;
  bindings?: Record<string, string | number | boolean | undefined>;
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const loggerOptions: LoggerOptions = {
    name: options.name ?? 'dbt-scheduler',
    level: options.level ?? 'info',
    redact: {
      paths: [...SECRET_REDACT_PATHS],
      censor: '[redacted]',
    },
    mixin() {
      return options.bindings ?? {};
    },
  };

  if (options.pretty) {
    return pino({
      ...loggerOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      },
    });
  }

  return pino(loggerOptions);
}

export function shouldUsePrettyLogs(env: NodeJS.Dict<string> = process.env): boolean {
  return env.NODE_ENV !== 'production' && env.LOG_PRETTY !== 'false';
}
