import { ValidationError } from '@dbt-scheduler/types';
import { describe, expect, it } from 'vitest';
import { nextOccurrenceAfter, nextRunAtAfterCatchUp } from './cron.js';
import { buildScheduleExecutionKey, isScheduleDue } from './schedule.js';

describe('scheduler-core', () => {
  it('detects due schedules', () => {
    expect(isScheduleDue(new Date('2026-08-25T15:00:00Z'), new Date('2026-08-25T15:00:00Z'))).toBe(
      true,
    );
    expect(isScheduleDue(new Date('2026-08-25T16:00:00Z'), new Date('2026-08-25T15:00:00Z'))).toBe(
      false,
    );
  });

  it('builds an idempotency key from schedule and scheduled_for', () => {
    expect(buildScheduleExecutionKey('10', new Date('2026-08-25T15:00:00Z'))).toBe(
      '10:2026-08-25T15:00:00.000Z',
    );
  });
});

describe('cron next_run_at', () => {
  it('advances an hourly UTC schedule to the next hour', () => {
    expect(
      nextOccurrenceAfter('0 * * * *', 'UTC', new Date('2026-08-26T15:00:00.000Z')).toISOString(),
    ).toBe('2026-08-26T16:00:00.000Z');
  });

  it('computes 9am America/New_York in UTC', () => {
    const after = new Date('2026-08-26T13:00:00.000Z');
    expect(nextOccurrenceAfter('0 9 * * *', 'America/New_York', after).toISOString()).toBe(
      '2026-08-27T13:00:00.000Z',
    );
  });

  it('skips missed hourly slots up to the next future occurrence', () => {
    const next = nextRunAtAfterCatchUp(
      '0 * * * *',
      'UTC',
      new Date('2026-08-26T10:00:00.000Z'),
      new Date('2026-08-26T13:30:00.000Z'),
    );
    expect(next.toISOString()).toBe('2026-08-26T14:00:00.000Z');
  });

  it('rejects cron expressions that are not 5 fields', () => {
    expect(() => nextOccurrenceAfter('* * * * * *', 'UTC', new Date())).toThrow(ValidationError);
  });

  it('rejects an invalid timezone', () => {
    expect(() => nextOccurrenceAfter('0 * * * *', 'Not/A_Zone', new Date())).toThrow(
      ValidationError,
    );
  });
});
