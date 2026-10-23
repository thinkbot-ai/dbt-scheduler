import { describe, expect, it } from 'vitest';
import { classifyDbtFailure, isRetryableFailure } from './failure-class.js';

const base = {
  exitCode: 1,
  signal: null,
  timedOut: false,
  cancelled: false,
  spawnFailed: false,
};

describe('classifyDbtFailure', () => {
  it('returns no failure class for a clean exit', () => {
    expect(classifyDbtFailure({ ...base, exitCode: 0 })).toBeUndefined();
  });

  it('prefers cancellation over every other signal', () => {
    expect(
      classifyDbtFailure({ ...base, cancelled: true, timedOut: true, spawnFailed: true }),
    ).toBe('CANCELLED');
  });

  it('treats an unstartable dbt as a configuration failure', () => {
    expect(classifyDbtFailure({ ...base, exitCode: null, spawnFailed: true })).toBe(
      'CONFIGURATION_FAILURE',
    );
  });

  it('treats a timeout as transient', () => {
    expect(classifyDbtFailure({ ...base, timedOut: true })).toBe('TRANSIENT_FAILURE');
  });

  it('detects configuration problems in dbt output', () => {
    expect(
      classifyDbtFailure({
        ...base,
        exitCode: 2,
        output: 'Runtime Error\n  Could not find profile named "analytics"',
      }),
    ).toBe('CONFIGURATION_FAILURE');
  });

  it('detects transient connectivity problems in dbt output', () => {
    expect(
      classifyDbtFailure({ ...base, output: 'Connection refused while contacting Dremio' }),
    ).toBe('TRANSIENT_FAILURE');
  });

  it('defaults a non-zero exit to a dbt failure', () => {
    expect(classifyDbtFailure({ ...base, output: 'Failure in test unique_orders_id' })).toBe(
      'DBT_FAILURE',
    );
  });

  it('treats an unexpected external kill as a worker failure', () => {
    expect(classifyDbtFailure({ ...base, exitCode: null, signal: 'SIGKILL' })).toBe(
      'WORKER_FAILURE',
    );
  });

  it('marks only transient and worker failures as retryable', () => {
    expect(isRetryableFailure('TRANSIENT_FAILURE')).toBe(true);
    expect(isRetryableFailure('WORKER_FAILURE')).toBe(true);
    expect(isRetryableFailure('CONFIGURATION_FAILURE')).toBe(false);
    expect(isRetryableFailure('DBT_FAILURE')).toBe(false);
    expect(isRetryableFailure('CANCELLED')).toBe(false);
    expect(isRetryableFailure(undefined)).toBe(false);
  });
});
