import { GitError } from '@dbt-scheduler/types';
import { spawn as nodeSpawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { githubAuthorizationHeader } from './refs.js';
import { containsSecret, redactSecrets } from './redact.js';

export const DEFAULT_GIT_TIMEOUT_MS = 600_000;
export const DEFAULT_GIT_GRACEFUL_SHUTDOWN_MS = 10_000;

export interface GitChildProcess {
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly exitCode: number | null;
  readonly signalCode: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals): boolean;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(
    event: 'close',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
}

export type GitSpawnFn = (
  bin: string,
  argv: readonly string[],
  options: { cwd?: string; env: NodeJS.ProcessEnv; windowsHide: boolean },
) => GitChildProcess;

export interface GitCommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface RunGitOptions {
  args: readonly string[];
  gitBin?: string;
  cwd?: string;
  token?: string;
  timeoutMs?: number;
  gracefulShutdownMs?: number;
  signal?: AbortSignal;
  spawn?: GitSpawnFn;
  parentEnv?: NodeJS.ProcessEnv;
}

function buildGitEnv(parentEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    LANG: 'C',
  };
  for (const key of [
    'PATH',
    'Path',
    'PATHEXT',
    'HOME',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'SYSTEMROOT',
    'SystemRoot',
    'WINDIR',
    'TMP',
    'TEMP',
    'TMPDIR',
  ]) {
    const value = parentEnv[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

function buildArgv(args: readonly string[], token: string | undefined): string[] {
  const argv: string[] = ['-c', 'core.askPass=', '-c', 'credential.helper='];
  if (token !== undefined && token.length > 0) {
    argv.push('-c', `http.extraHeader=${githubAuthorizationHeader(token)}`);
  }
  argv.push(...args);
  return argv;
}

function toGitError(
  message: string,
  options: {
    stdout: string;
    stderr: string;
    token?: string;
    cause?: unknown;
  },
): GitError {
  const combined = redactSecrets(`${options.stdout}\n${options.stderr}`);
  if (options.token !== undefined && containsSecret(combined, options.token)) {
    throw new GitError('Git error contained a secret and was suppressed');
  }
  return new GitError(redactSecrets(message), {
    ...(options.cause === undefined ? {} : { cause: options.cause }),
    details: {
      stderr: redactSecrets(options.stderr).slice(0, 4_000),
      stdout: redactSecrets(options.stdout).slice(0, 1_000),
    },
  });
}

export async function runGit(options: RunGitOptions): Promise<GitCommandResult> {
  const gitBin = options.gitBin ?? (process.platform === 'win32' ? 'git.exe' : 'git');
  const argv = buildArgv(options.args, options.token);
  const spawnFn = options.spawn ?? defaultGitSpawn;
  const timeoutMs = options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
  const gracefulShutdownMs = options.gracefulShutdownMs ?? DEFAULT_GIT_GRACEFUL_SHUTDOWN_MS;
  const env = buildGitEnv(options.parentEnv ?? process.env);
  const token = options.token;

  let timedOut = false;
  let cancelled = false;
  let timeoutTimer: NodeJS.Timeout | undefined;
  let killTimer: NodeJS.Timeout | undefined;

  const outcome = await new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    spawnError?: Error;
  }>((resolve) => {
    let child: GitChildProcess;
    try {
      child = spawnFn(gitBin, argv, {
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        env,
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: '',
        spawnError: error instanceof Error ? error : new Error('Failed to spawn git'),
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    const settle = (result: {
      exitCode: number | null;
      signal: NodeJS.Signals | null;
      stdout: string;
      stderr: string;
      spawnError?: Error;
    }): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };

    const terminate = (): void => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
      }, gracefulShutdownMs);
      killTimer.unref?.();
    };

    function onAbort(): void {
      cancelled = true;
      terminate();
    }

    if (options.signal !== undefined) {
      if (options.signal.aborted) {
        cancelled = true;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    timeoutTimer.unref?.();

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });

    child.on('error', (error: Error) => {
      settle({ exitCode: null, signal: null, stdout, stderr, spawnError: error });
    });
    child.on('close', (code, signal) => {
      settle({ exitCode: code, signal, stdout, stderr });
    });

    if (cancelled) {
      terminate();
    }
  });

  if (outcome.spawnError !== undefined) {
    throw toGitError(`Failed to start git using "${gitBin}": ${outcome.spawnError.message}`, {
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      ...(token === undefined ? {} : { token }),
      cause: outcome.spawnError,
    });
  }
  if (cancelled) {
    throw toGitError('Git command was cancelled', {
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      ...(token === undefined ? {} : { token }),
    });
  }
  if (timedOut) {
    throw toGitError(`Git command exceeded the ${timeoutMs}ms timeout`, {
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      ...(token === undefined ? {} : { token }),
    });
  }
  if (outcome.exitCode !== 0) {
    throw toGitError(
      `git ${options.args[0] ?? ''} failed with exit code ${String(outcome.exitCode)}`,
      {
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        ...(token === undefined ? {} : { token }),
      },
    );
  }

  return {
    exitCode: outcome.exitCode,
    signal: outcome.signal,
    stdout: redactSecrets(outcome.stdout),
    stderr: redactSecrets(outcome.stderr),
  };
}

const defaultGitSpawn: GitSpawnFn = (bin, argv, options) =>
  nodeSpawn(bin, [...argv], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env: options.env,
    windowsHide: options.windowsHide,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
