import type { FailureClass } from '@dbt-scheduler/types';

/**
 * Messages that indicate the project or credentials are wrong. Retrying these
 * without a config change just burns attempts, so they are not transient.
 */
const CONFIGURATION_SIGNALS = [
  /could not find profile/i,
  /profiles\.yml/i,
  /dbt_project\.yml/i,
  /compilation error/i,
  /invalid --select/i,
  /credentials/i,
  /no such (?:file or )?directory/i,
  /is not a dbt project/i,
];

/**
 * Messages that usually clear on their own, so a retry is worthwhile.
 */
const TRANSIENT_SIGNALS = [
  /connection (?:refused|reset|timed out)/i,
  /temporarily unavailable/i,
  /timeout/i,
  /econnreset|etimedout|enotfound|eai_again/i,
  /service unavailable|503|502|504/i,
];

export interface ClassifyDbtFailureInput {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  cancelled: boolean;
  spawnFailed: boolean;
  output?: string;
}

export function classifyDbtFailure(input: ClassifyDbtFailureInput): FailureClass | undefined {
  if (input.cancelled) {
    return 'CANCELLED';
  }
  if (input.spawnFailed) {
    // dbt could not be started at all: wrong DBT_BIN, missing venv, bad cwd.
    return 'CONFIGURATION_FAILURE';
  }
  if (input.timedOut) {
    return 'TRANSIENT_FAILURE';
  }
  if (input.exitCode === 0) {
    return undefined;
  }

  const output = input.output ?? '';
  if (TRANSIENT_SIGNALS.some((pattern) => pattern.test(output))) {
    return 'TRANSIENT_FAILURE';
  }
  if (CONFIGURATION_SIGNALS.some((pattern) => pattern.test(output))) {
    return 'CONFIGURATION_FAILURE';
  }
  if (input.exitCode === null && input.signal !== null) {
    // Killed by something other than our own cancellation or timeout.
    return 'WORKER_FAILURE';
  }
  return 'DBT_FAILURE';
}

export function isRetryableFailure(failureClass: FailureClass | undefined): boolean {
  return failureClass === 'TRANSIENT_FAILURE' || failureClass === 'WORKER_FAILURE';
}
