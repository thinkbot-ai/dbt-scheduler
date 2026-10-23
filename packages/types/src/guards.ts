import { JOB_PRIORITIES, JOB_STATUSES } from './enums.js';

export function isJobStatus(value: string): value is (typeof JOB_STATUSES)[number] {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

export function isJobPriority(
  value: number,
): value is (typeof JOB_PRIORITIES)[keyof typeof JOB_PRIORITIES] {
  return Object.values(JOB_PRIORITIES).includes(
    value as (typeof JOB_PRIORITIES)[keyof typeof JOB_PRIORITIES],
  );
}

export function assertNever(value: never, message = 'Unexpected value'): never {
  throw new Error(`${message}: ${String(value)}`);
}
