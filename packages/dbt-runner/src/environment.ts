/**
 * Environment variables forwarded to dbt. Anything not listed here (and not
 * prefixed `DBT_`) is dropped so unrelated host secrets never reach the child.
 */
const PASSTHROUGH_ENV_KEYS = [
  'PATH',
  'Path',
  'PATHEXT',
  'HOME',
  'USERPROFILE',
  'SYSTEMROOT',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'TZ',
  'PYTHONPATH',
  'PYTHONHOME',
  'VIRTUAL_ENV',
  // Windows Python resolves `pip install --user` site-packages via %APPDATA%
  // (site.getusersitepackages()); without it a --user-installed dbt console
  // script fails with "ModuleNotFoundError: No module named 'dbt'".
  'APPDATA',
  'LOCALAPPDATA',
] as const;

const DBT_PREFIX = /^DBT_/;

export interface BuildDbtEnvironmentInput {
  parentEnv?: NodeJS.ProcessEnv;
  profilesDir?: string;
  targetPath?: string;
  extraEnv?: Readonly<Record<string, string>>;
}

export function buildDbtEnvironment(input: BuildDbtEnvironmentInput = {}): NodeJS.ProcessEnv {
  const parentEnv = input.parentEnv ?? process.env;
  const env: NodeJS.ProcessEnv = {};

  for (const key of PASSTHROUGH_ENV_KEYS) {
    const value = parentEnv[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(parentEnv)) {
    if (DBT_PREFIX.test(key) && value !== undefined) {
      env[key] = value;
    }
  }

  // Without this Python buffers stdout and logs only arrive when dbt exits.
  env.PYTHONUNBUFFERED = '1';
  env.DBT_SEND_ANONYMOUS_USAGE_STATS = parentEnv.DBT_SEND_ANONYMOUS_USAGE_STATS ?? 'false';

  if (input.profilesDir !== undefined) {
    env.DBT_PROFILES_DIR = input.profilesDir;
  }
  if (input.targetPath !== undefined) {
    env.DBT_TARGET_PATH = input.targetPath;
  }

  for (const [key, value] of Object.entries(input.extraEnv ?? {})) {
    env[key] = value;
  }

  return env;
}
