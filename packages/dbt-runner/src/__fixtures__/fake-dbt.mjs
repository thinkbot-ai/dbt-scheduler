// Stand-in for the dbt CLI so runner tests exercise real process spawning,
// pipes, exit codes, and signals instead of a mocked child process.
// Behavior is driven by FAKE_DBT_* variables passed through `extraEnv`.
import { mkdirSync, writeFileSync, writeSync } from 'node:fs';
import path from 'node:path';

const env = process.env;
const args = process.argv.slice(2);

const writeOut = (text) => writeSync(1, text);
const writeErr = (text) => writeSync(2, text);

if (env.FAKE_DBT_ECHO_ARGV === '1') {
  writeOut(`argv=${JSON.stringify(args)}\n`);
}
if (env.FAKE_DBT_ECHO_CWD === '1') {
  writeOut(`cwd=${process.cwd()}\n`);
}
if (env.FAKE_DBT_ECHO_ENV !== undefined) {
  const name = env.FAKE_DBT_ECHO_ENV;
  writeOut(`env:${name}=${env[name] ?? '<unset>'}\n`);
}
if (env.FAKE_DBT_STDOUT !== undefined) {
  writeOut(env.FAKE_DBT_STDOUT);
}
if (env.FAKE_DBT_STDERR !== undefined) {
  writeErr(env.FAKE_DBT_STDERR);
}

if (env.FAKE_DBT_WRITE_RUN_RESULTS === '1') {
  const targetDir = path.resolve(process.cwd(), env.FAKE_DBT_TARGET_PATH ?? 'target');
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(
    path.join(targetDir, 'run_results.json'),
    JSON.stringify({
      metadata: {
        dbt_version: '1.10.23',
        invocation_id: '11111111-2222-3333-4444-555555555555',
        generated_at: '2026-08-26T14:00:00.000Z',
      },
      elapsed_time: 12.5,
      results: [
        { unique_id: 'model.analytics.stg_orders', status: 'success', execution_time: 1.5 },
        { unique_id: 'model.analytics.dim_customers', status: 'success', execution_time: 2.5 },
        { unique_id: 'model.analytics.fct_revenue', status: 'error', execution_time: 0.5 },
        { unique_id: 'model.analytics.mart_summary', status: 'skipped', execution_time: 0 },
        { unique_id: 'test.analytics.not_null_orders_id', status: 'pass', execution_time: 0.2 },
        { unique_id: 'test.analytics.unique_orders_id', status: 'fail', execution_time: 0.2 },
        { unique_id: 'test.analytics.accepted_values', status: 'warn', execution_time: 0.1 },
      ],
    }),
  );
  writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify({ nodes: {} }));
}

if (env.FAKE_DBT_WRITE_BAD_RUN_RESULTS === '1') {
  const targetDir = path.resolve(process.cwd(), 'target');
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(path.join(targetDir, 'run_results.json'), '{ not valid json');
}

if (env.FAKE_DBT_IGNORE_SIGTERM === '1') {
  process.on('SIGTERM', () => {
    writeOut('ignoring SIGTERM\n');
  });
}

const exitCode = Number(env.FAKE_DBT_EXIT_CODE ?? '0');
const sleepMs = Number(env.FAKE_DBT_SLEEP_MS ?? '0');

if (sleepMs > 0) {
  setTimeout(() => {
    process.exit(exitCode);
  }, sleepMs);
} else {
  process.exit(exitCode);
}
