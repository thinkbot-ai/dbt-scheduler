import { ConfigurationError } from '@dbt-scheduler/types';
import { describe, expect, it } from 'vitest';
import { isSecretConfigKey, loadConfig, publicConfig } from './env.js';

const validEnv = {
  DATABASE_URL: 'postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler',
};

describe('loadConfig', () => {
  it('loads defaults for optional values', () => {
    const config = loadConfig(validEnv);
    expect(config.PORT).toBe(4000);
    expect(config.PROCESS_ROLE).toBe('api');
    expect(config.MAX_CONCURRENT_JOBS).toBe(10);
    expect(config.WORKER_CONCURRENCY).toBe(2);
    expect(config.SCHEDULER_TICK_INTERVAL_SECONDS).toBe(10);
  });

  it('accepts silent log level', () => {
    const config = loadConfig({ ...validEnv, LOG_LEVEL: 'silent' });
    expect(config.LOG_LEVEL).toBe('silent');
  });

  it('rejects missing DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(ConfigurationError);
  });

  it('never includes secrets in public config', () => {
    const config = loadConfig({
      ...validEnv,
      GIT_TOKEN: 'ghp_example_not_real',
      API_AUTH_TOKEN: 'secret-token',
    });
    const published = publicConfig(config);
    expect(published.GIT_TOKEN).toBeUndefined();
    expect(published.API_AUTH_TOKEN).toBeUndefined();
    expect(published.GIT_TOKEN_CONFIGURED).toBe(true);
    expect(JSON.stringify(published)).not.toContain('ghp_example_not_real');
    expect(JSON.stringify(published)).not.toContain('secret-token');
  });

  it('identifies secret keys', () => {
    expect(isSecretConfigKey('GIT_TOKEN')).toBe(true);
    expect(isSecretConfigKey('DATABASE_URL')).toBe(true);
    expect(isSecretConfigKey('PORT')).toBe(false);
  });
});
