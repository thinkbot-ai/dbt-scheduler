import { ValidationError } from '@dbt-scheduler/types';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDbt, type DbtLogLine, type RunDbtOptions } from './runner.js';

const FAKE_DBT = fileURLToPath(new URL('./__fixtures__/fake-dbt.mjs', import.meta.url));

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'dbt-runner-'));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function runFakeDbt(
  extraEnv: Record<string, string>,
  overrides: Partial<RunDbtOptions> = {},
): Promise<Awaited<ReturnType<typeof runDbt>>> {
  return runDbt({
    bin: process.execPath,
    binArgs: [FAKE_DBT],
    command: 'build',
    cwd: workspace,
    extraEnv,
    timeoutMs: 30_000,
    ...overrides,
  });
}

describe('runDbt', () => {
  it('reports a successful execution', async () => {
    const result = await runFakeDbt({ FAKE_DBT_EXIT_CODE: '0' });

    expect(result.status).toBe('SUCCESS');
    expect(result.succeeded).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.failureClass).toBeUndefined();
    expect(result.errorMessage).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.startedAt.getTime()).toBeLessThanOrEqual(result.finishedAt.getTime());
  });

  it('reports a failed execution without throwing', async () => {
    const result = await runFakeDbt({
      FAKE_DBT_EXIT_CODE: '1',
      FAKE_DBT_STDERR: 'Database Error in model fct_revenue\n',
    });

    expect(result.status).toBe('FAILED');
    expect(result.succeeded).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.failureClass).toBe('DBT_FAILURE');
    expect(result.errorMessage).toBe('dbt exited with code 1');
  });

  it('classifies a missing dbt binary as a configuration failure', async () => {
    const result = await runDbt({
      bin: path.join(workspace, 'definitely-not-dbt'),
      command: 'build',
      cwd: workspace,
      timeoutMs: 10_000,
    });

    expect(result.status).toBe('FAILED');
    expect(result.failureClass).toBe('CONFIGURATION_FAILURE');
    expect(result.errorMessage).toContain('Failed to start dbt');
    expect(result.artifacts.runResultsFound).toBe(false);
  });

  it('captures stdout and stderr separately', async () => {
    const result = await runFakeDbt({
      FAKE_DBT_STDOUT: 'Running with dbt=1.10.23\nCompleted successfully\n',
      FAKE_DBT_STDERR: 'a warning line\n',
    });

    expect(result.stdout).toContain('Running with dbt=1.10.23');
    expect(result.stdout).toContain('Completed successfully');
    expect(result.stderr).toContain('a warning line');
    expect(result.stdout).not.toContain('a warning line');
    expect(result.outputTruncated).toBe(false);
  });

  it('streams whole lines to onLog as they arrive', async () => {
    const lines: DbtLogLine[] = [];
    await runFakeDbt(
      { FAKE_DBT_STDOUT: 'first\nsecond\n', FAKE_DBT_STDERR: 'problem\n' },
      { onLog: (line) => lines.push(line) },
    );

    const stdout = lines.filter((line) => line.stream === 'stdout').map((line) => line.message);
    const stderr = lines.filter((line) => line.stream === 'stderr').map((line) => line.message);

    expect(stdout).toEqual(['first', 'second']);
    expect(stderr).toEqual(['problem']);
    expect(lines.every((line) => !line.message.includes('\n'))).toBe(true);
  });

  it('emits a trailing line that never received a newline', async () => {
    const lines: string[] = [];
    await runFakeDbt(
      { FAKE_DBT_STDOUT: 'no trailing newline' },
      { onLog: (line) => lines.push(line.message) },
    );

    expect(lines).toContain('no trailing newline');
  });

  it('terminates dbt when the timeout elapses', async () => {
    const result = await runFakeDbt(
      { FAKE_DBT_SLEEP_MS: '30000' },
      { timeoutMs: 250, gracefulShutdownMs: 250 },
    );

    expect(result.status).toBe('TIMED_OUT');
    expect(result.timedOut).toBe(true);
    expect(result.succeeded).toBe(false);
    expect(result.failureClass).toBe('TRANSIENT_FAILURE');
    expect(result.errorMessage).toContain('timeout');
  });

  it('cancels a running dbt process when the signal aborts', async () => {
    const controller = new AbortController();
    const pending = runFakeDbt(
      { FAKE_DBT_SLEEP_MS: '30000', FAKE_DBT_STDOUT: 'started\n' },
      { signal: controller.signal, gracefulShutdownMs: 250 },
    );

    setTimeout(() => controller.abort(), 150);
    const result = await pending;

    expect(result.status).toBe('CANCELLED');
    expect(result.cancelled).toBe(true);
    expect(result.failureClass).toBe('CANCELLED');
    expect(result.errorMessage).toBe('dbt execution was cancelled');
  });

  it('force-kills dbt when it ignores the graceful stop request', async () => {
    const controller = new AbortController();
    const pending = runFakeDbt(
      { FAKE_DBT_SLEEP_MS: '30000', FAKE_DBT_IGNORE_SIGTERM: '1' },
      { signal: controller.signal, gracefulShutdownMs: 200 },
    );

    setTimeout(() => controller.abort(), 150);
    const result = await pending;

    expect(result.cancelled).toBe(true);
    expect(result.status).toBe('CANCELLED');
  });

  it('does not start dbt when the signal is already aborted', async () => {
    const result = await runFakeDbt(
      { FAKE_DBT_SLEEP_MS: '30000' },
      { signal: AbortSignal.abort(), gracefulShutdownMs: 200 },
    );

    expect(result.status).toBe('CANCELLED');
  });

  it('parses run_results.json into metrics', async () => {
    const result = await runFakeDbt({ FAKE_DBT_WRITE_RUN_RESULTS: '1', FAKE_DBT_EXIT_CODE: '1' });

    expect(result.artifacts.runResultsFound).toBe(true);
    expect(result.artifacts.manifestFound).toBe(true);
    expect(result.artifacts.catalogFound).toBe(false);
    expect(result.artifacts.dbtVersion).toBe('1.10.23');
    expect(result.metrics).toEqual({
      modelsAttempted: 4,
      modelsSuccessful: 2,
      modelsFailed: 1,
      modelsSkipped: 1,
      testsPassed: 2,
      testsFailed: 1,
      executionDurationMs: 12_500,
    });
  });

  it('succeeds even when dbt writes no artifacts', async () => {
    const result = await runFakeDbt({ FAKE_DBT_EXIT_CODE: '0' });

    expect(result.status).toBe('SUCCESS');
    expect(result.artifacts.runResultsFound).toBe(false);
    expect(result.artifacts.parseError).toBeUndefined();
    expect(result.metrics).toBeUndefined();
  });

  it('reports unparsable artifacts without failing the run', async () => {
    const result = await runFakeDbt({ FAKE_DBT_WRITE_BAD_RUN_RESULTS: '1' });

    expect(result.status).toBe('SUCCESS');
    expect(result.artifacts.runResultsFound).toBe(true);
    expect(result.artifacts.parseError).toContain('not valid JSON');
    expect(result.metrics).toBeUndefined();
  });

  it('passes validated arguments as argv and runs in the given directory', async () => {
    const result = await runFakeDbt(
      { FAKE_DBT_ECHO_ARGV: '1', FAKE_DBT_ECHO_CWD: '1' },
      { args: ['--select', 'marts+', '--exclude', 'tag:experimental'] },
    );

    expect(result.stdout).toContain(
      'argv=["build","--select","marts+","--exclude","tag:experimental"]',
    );
    expect(result.argv).toEqual([
      FAKE_DBT,
      'build',
      '--select',
      'marts+',
      '--exclude',
      'tag:experimental',
    ]);
    expect(result.stdout).toContain('cwd=');
  });

  it('rejects unsafe arguments before spawning anything', async () => {
    await expect(runFakeDbt({}, { args: ['--select', 'marts; rm -rf /'] })).rejects.toBeInstanceOf(
      ValidationError,
    );

    await expect(runFakeDbt({}, { command: 'run-operation' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('truncates captured output beyond the configured limit', async () => {
    const result = await runFakeDbt(
      { FAKE_DBT_STDOUT: `${'x'.repeat(500)}\n` },
      { maxCapturedChars: 100 },
    );

    expect(result.stdout).toHaveLength(100);
    expect(result.outputTruncated).toBe(true);
  });

  it('can skip artifact reading', async () => {
    const result = await runFakeDbt({ FAKE_DBT_WRITE_RUN_RESULTS: '1' }, { readArtifacts: false });

    expect(result.artifacts.runResultsFound).toBe(false);
    expect(result.metrics).toBeUndefined();
  });
});
