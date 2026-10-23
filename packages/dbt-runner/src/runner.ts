import type { FailureClass, JobRunMetrics, LogStream } from '@dbt-scheduler/types';
import { spawn as nodeSpawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { DEFAULT_TARGET_PATH, readDbtArtifacts, type DbtArtifacts } from './artifacts.js';
import { buildDbtEnvironment } from './environment.js';
import { classifyDbtFailure } from './failure-class.js';
import { createDbtSpawnPlan, type DbtSpawnPlan } from './spawn-plan.js';

export const DEFAULT_GRACEFUL_SHUTDOWN_MS = 15_000;
export const DEFAULT_MAX_CAPTURED_CHARS = 1_000_000;

export type DbtExecutionStatus = 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT';

export interface DbtLogLine {
  stream: Extract<LogStream, 'stdout' | 'stderr'>;
  message: string;
  timestamp: Date;
}

/**
 * The subset of `ChildProcess` the runner relies on. Keeping it narrow lets
 * callers inject a fake process without reconstructing Node's full type.
 */
export interface DbtChildProcess {
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

export type SpawnFn = (
  bin: string,
  argv: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; windowsHide: boolean },
) => DbtChildProcess;

export interface RunDbtOptions {
  /** dbt executable. Operator-controlled (`DBT_BIN`), never user input. */
  bin?: string;
  /**
   * Arguments inserted before the dbt command, for interpreter-style
   * invocation such as `python -m dbt`. Operator-controlled.
   */
  binArgs?: readonly string[];
  command: string;
  args?: readonly string[];
  cwd: string;
  timeoutMs?: number;
  gracefulShutdownMs?: number;
  signal?: AbortSignal;
  parentEnv?: NodeJS.ProcessEnv;
  extraEnv?: Readonly<Record<string, string>>;
  profilesDir?: string;
  targetPath?: string;
  readArtifacts?: boolean;
  maxCapturedChars?: number;
  onLog?: (line: DbtLogLine) => void;
  spawn?: SpawnFn;
}

export interface DbtExecutionResult {
  status: DbtExecutionStatus;
  succeeded: boolean;
  bin: string;
  argv: string[];
  cwd: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
  timedOut: boolean;
  cancelled: boolean;
  failureClass?: FailureClass;
  errorMessage?: string;
  artifacts: DbtArtifacts;
  metrics?: JobRunMetrics;
}

class BoundedBuffer {
  private content = '';
  private truncated = false;

  constructor(private readonly maxChars: number) {}

  append(chunk: string): void {
    if (this.content.length >= this.maxChars) {
      this.truncated = true;
      return;
    }
    const room = this.maxChars - this.content.length;
    if (chunk.length > room) {
      this.content += chunk.slice(0, room);
      this.truncated = true;
      return;
    }
    this.content += chunk;
  }

  get value(): string {
    return this.content;
  }

  get wasTruncated(): boolean {
    return this.truncated;
  }
}

/**
 * Splits a byte stream into whole lines, holding an unterminated trailing
 * fragment until more data arrives or the stream ends.
 */
class LineSplitter {
  private pending = '';

  push(chunk: string, emit: (line: string) => void): void {
    this.pending += chunk;
    let newlineIndex = this.pending.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.pending.slice(0, newlineIndex).replace(/\r$/, '');
      this.pending = this.pending.slice(newlineIndex + 1);
      emit(line);
      newlineIndex = this.pending.indexOf('\n');
    }
  }

  flush(emit: (line: string) => void): void {
    if (this.pending.length > 0) {
      const line = this.pending.replace(/\r$/, '');
      this.pending = '';
      emit(line);
    }
  }
}

interface ProcessOutcome {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  spawnError?: Error;
}

/**
 * Executes dbt through `spawn` with a validated argv. Never uses a shell, so
 * arguments cannot be reinterpreted as shell syntax.
 *
 * Invalid dbt commands/arguments throw `ValidationError` before anything is
 * spawned. Runtime outcomes (non-zero exit, timeout, cancellation, missing
 * binary) are returned as a structured result so callers can persist them.
 */
export async function runDbt(options: RunDbtOptions): Promise<DbtExecutionResult> {
  const plan: DbtSpawnPlan = createDbtSpawnPlan({
    bin: options.bin ?? 'dbt',
    command: options.command,
    ...(options.args === undefined ? {} : { args: options.args }),
    cwd: options.cwd,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });

  const argv = [...(options.binArgs ?? []), ...plan.argv];
  const targetPath = options.targetPath ?? DEFAULT_TARGET_PATH;
  const spawnFn = options.spawn ?? defaultSpawn;
  const maxCapturedChars = options.maxCapturedChars ?? DEFAULT_MAX_CAPTURED_CHARS;
  const gracefulShutdownMs = options.gracefulShutdownMs ?? DEFAULT_GRACEFUL_SHUTDOWN_MS;

  const env = buildDbtEnvironment({
    ...(options.parentEnv === undefined ? {} : { parentEnv: options.parentEnv }),
    ...(options.profilesDir === undefined ? {} : { profilesDir: options.profilesDir }),
    ...(options.extraEnv === undefined ? {} : { extraEnv: options.extraEnv }),
    targetPath,
  });

  const stdoutBuffer = new BoundedBuffer(maxCapturedChars);
  const stderrBuffer = new BoundedBuffer(maxCapturedChars);
  const startedAt = new Date();

  let timedOut = false;
  let cancelled = false;
  let killTimer: NodeJS.Timeout | undefined;
  let timeoutTimer: NodeJS.Timeout | undefined;

  const outcome = await new Promise<ProcessOutcome>((resolve) => {
    let child: DbtChildProcess;
    try {
      child = spawnFn(plan.bin, argv, {
        cwd: plan.cwd,
        env,
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        exitCode: null,
        signal: null,
        spawnError: error instanceof Error ? error : new Error('Failed to spawn dbt'),
      });
      return;
    }

    let settled = false;
    const settle = (result: ProcessOutcome): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(killTimer);
      clearTimeout(timeoutTimer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };

    /**
     * Ask dbt to stop, then force-kill if it ignores the request. Only the dbt
     * child is signalled; the worker process keeps running.
     */
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

    if (plan.timeoutMs > 0 && Number.isFinite(plan.timeoutMs)) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        terminate();
      }, plan.timeoutMs);
      timeoutTimer.unref?.();
    }

    const stdoutSplitter = new LineSplitter();
    const stderrSplitter = new LineSplitter();

    const handleChunk = (
      stream: DbtLogLine['stream'],
      splitter: LineSplitter,
      buffer: BoundedBuffer,
      chunk: Buffer | string,
    ): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      buffer.append(text);
      splitter.push(text, (message) => {
        options.onLog?.({ stream, message, timestamp: new Date() });
      });
    };

    child.stdout.on('data', (chunk: Buffer) => {
      handleChunk('stdout', stdoutSplitter, stdoutBuffer, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      handleChunk('stderr', stderrSplitter, stderrBuffer, chunk);
    });

    child.on('error', (error: Error) => {
      settle({ exitCode: null, signal: null, spawnError: error });
    });

    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      stdoutSplitter.flush((message) => {
        options.onLog?.({ stream: 'stdout', message, timestamp: new Date() });
      });
      stderrSplitter.flush((message) => {
        options.onLog?.({ stream: 'stderr', message, timestamp: new Date() });
      });
      settle({ exitCode: code, signal });
    });

    if (cancelled) {
      terminate();
    }
  });

  const finishedAt = new Date();
  const spawnFailed = outcome.spawnError !== undefined;

  const artifacts =
    options.readArtifacts === false || spawnFailed
      ? { runResultsFound: false, manifestFound: false, catalogFound: false }
      : await readDbtArtifacts(plan.cwd, targetPath);

  const succeeded = !spawnFailed && !cancelled && !timedOut && outcome.exitCode === 0;
  const status: DbtExecutionStatus = cancelled
    ? 'CANCELLED'
    : timedOut
      ? 'TIMED_OUT'
      : succeeded
        ? 'SUCCESS'
        : 'FAILED';

  const failureClass = succeeded
    ? undefined
    : classifyDbtFailure({
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        timedOut,
        cancelled,
        spawnFailed,
        output: `${stdoutBuffer.value}\n${stderrBuffer.value}`,
      });

  const result: DbtExecutionResult = {
    status,
    succeeded,
    bin: plan.bin,
    argv,
    cwd: plan.cwd,
    exitCode: outcome.exitCode,
    signal: outcome.signal,
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    stdout: stdoutBuffer.value,
    stderr: stderrBuffer.value,
    outputTruncated: stdoutBuffer.wasTruncated || stderrBuffer.wasTruncated,
    timedOut,
    cancelled,
    artifacts,
  };

  if (failureClass !== undefined) {
    result.failureClass = failureClass;
  }
  if (artifacts.metrics !== undefined) {
    result.metrics = artifacts.metrics;
  }

  const errorMessage = describeFailure({
    status,
    spawnError: outcome.spawnError,
    exitCode: outcome.exitCode,
    signal: outcome.signal,
    timeoutMs: plan.timeoutMs,
    bin: plan.bin,
  });
  if (errorMessage !== undefined) {
    result.errorMessage = errorMessage;
  }

  return result;
}

function describeFailure(input: {
  status: DbtExecutionStatus;
  spawnError: Error | undefined;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timeoutMs: number;
  bin: string;
}): string | undefined {
  if (input.status === 'SUCCESS') {
    return undefined;
  }
  if (input.spawnError !== undefined) {
    return `Failed to start dbt using "${input.bin}": ${input.spawnError.message}`;
  }
  if (input.status === 'TIMED_OUT') {
    return `dbt exceeded the ${input.timeoutMs}ms timeout and was terminated`;
  }
  if (input.status === 'CANCELLED') {
    return 'dbt execution was cancelled';
  }
  if (input.exitCode !== null) {
    return `dbt exited with code ${input.exitCode}`;
  }
  if (input.signal !== null) {
    return `dbt was terminated by signal ${input.signal}`;
  }
  return 'dbt failed for an unknown reason';
}

const defaultSpawn: SpawnFn = (bin, argv, options) =>
  nodeSpawn(bin, [...argv], {
    cwd: options.cwd,
    env: options.env,
    windowsHide: options.windowsHide,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
