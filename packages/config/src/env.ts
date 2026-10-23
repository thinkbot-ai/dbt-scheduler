import { ConfigurationError, PROCESS_ROLES } from '@dbt-scheduler/types';
import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value === '' ? undefined : value));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PROCESS_ROLE: z.enum(PROCESS_ROLES).default('api'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  API_BIND_HOST: z.string().min(1).default('0.0.0.0'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(10),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  WORKER_ID: optionalString,
  JOB_LEASE_SECONDS: z.coerce.number().int().positive().default(60),
  HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().int().positive().default(15),
  SCHEDULER_TICK_INTERVAL_SECONDS: z.coerce.number().int().positive().default(10),
  WORKSPACE_ROOT: z.string().min(1).default('/workspaces'),
  WORKSPACE_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
  GIT_TOKEN: optionalString,
  DBT_BIN: z.string().min(1).default('dbt'),
  DBT_PYTHON_BIN: z.string().min(1).default('python3'),
  DBT_CORE_VERSION: z.string().min(1).default('1.10.23'),
  DBT_DREMIO_VERSION: z.string().min(1).default('1.10.1'),
  API_AUTH_TOKEN: optionalString,
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.Dict<string> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || 'env');
    throw new ConfigurationError('Invalid application configuration', {
      details: { fields },
    });
  }
  return parsed.data;
}

export function isSecretConfigKey(key: string): boolean {
  return /token|password|secret|database_url/i.test(key);
}

export function publicConfig(
  config: AppConfig,
): Record<string, string | number | boolean | undefined> {
  return {
    NODE_ENV: config.NODE_ENV,
    PROCESS_ROLE: config.PROCESS_ROLE,
    PORT: config.PORT,
    API_BIND_HOST: config.API_BIND_HOST,
    WEB_ORIGIN: config.WEB_ORIGIN,
    LOG_LEVEL: config.LOG_LEVEL,
    MAX_CONCURRENT_JOBS: config.MAX_CONCURRENT_JOBS,
    WORKER_CONCURRENCY: config.WORKER_CONCURRENCY,
    WORKER_ID: config.WORKER_ID,
    JOB_LEASE_SECONDS: config.JOB_LEASE_SECONDS,
    HEARTBEAT_INTERVAL_SECONDS: config.HEARTBEAT_INTERVAL_SECONDS,
    SCHEDULER_TICK_INTERVAL_SECONDS: config.SCHEDULER_TICK_INTERVAL_SECONDS,
    WORKSPACE_ROOT: config.WORKSPACE_ROOT,
    WORKSPACE_RETENTION_HOURS: config.WORKSPACE_RETENTION_HOURS,
    DBT_BIN: config.DBT_BIN,
    DBT_PYTHON_BIN: config.DBT_PYTHON_BIN,
    DBT_CORE_VERSION: config.DBT_CORE_VERSION,
    DBT_DREMIO_VERSION: config.DBT_DREMIO_VERSION,
    GIT_TOKEN_CONFIGURED: config.GIT_TOKEN !== undefined,
    API_AUTH_CONFIGURED: config.API_AUTH_TOKEN !== undefined,
  };
}
