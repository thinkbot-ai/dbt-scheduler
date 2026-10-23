import { describe, expect, it } from 'vitest';
import { buildDbtEnvironment } from './environment.js';

describe('buildDbtEnvironment', () => {
  it('forwards only allowlisted and DBT_ prefixed variables', () => {
    const env = buildDbtEnvironment({
      parentEnv: {
        PATH: '/usr/bin',
        HOME: '/home/runner',
        DBT_PROFILES_DIR: '/etc/dbt',
        AWS_SECRET_ACCESS_KEY: 'super-secret',
        GIT_TOKEN: 'ghp_example_not_real',
        DATABASE_URL: 'postgres://user:pw@host/db',
      },
    });

    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/runner');
    expect(env.DBT_PROFILES_DIR).toBe('/etc/dbt');
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.GIT_TOKEN).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('forwards APPDATA/LOCALAPPDATA so Windows can resolve a --user dbt install', () => {
    const env = buildDbtEnvironment({
      parentEnv: {
        APPDATA: 'C:\\Users\\runner\\AppData\\Roaming',
        LOCALAPPDATA: 'C:\\Users\\runner\\AppData\\Local',
      },
    });

    expect(env.APPDATA).toBe('C:\\Users\\runner\\AppData\\Roaming');
    expect(env.LOCALAPPDATA).toBe('C:\\Users\\runner\\AppData\\Local');
  });

  it('unbuffers Python output so logs stream during the run', () => {
    const env = buildDbtEnvironment({ parentEnv: {} });
    expect(env.PYTHONUNBUFFERED).toBe('1');
    expect(env.DBT_SEND_ANONYMOUS_USAGE_STATS).toBe('false');
  });

  it('lets the caller override profiles and target paths', () => {
    const env = buildDbtEnvironment({
      parentEnv: { DBT_PROFILES_DIR: '/parent' },
      profilesDir: '/job/profiles',
      targetPath: 'target',
    });

    expect(env.DBT_PROFILES_DIR).toBe('/job/profiles');
    expect(env.DBT_TARGET_PATH).toBe('target');
  });

  it('applies extraEnv last so job-specific values win', () => {
    const env = buildDbtEnvironment({
      parentEnv: { PATH: '/usr/bin' },
      profilesDir: '/job/profiles',
      extraEnv: { DBT_PROFILES_DIR: '/override', FAKE_DBT_EXIT_CODE: '1' },
    });

    expect(env.DBT_PROFILES_DIR).toBe('/override');
    expect(env.FAKE_DBT_EXIT_CODE).toBe('1');
  });
});
