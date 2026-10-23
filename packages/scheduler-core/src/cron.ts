import { ValidationError } from '@dbt-scheduler/types';
import { CronExpressionParser } from 'cron-parser';

const FIVE_FIELD_CRON = /^\s*\S+\s+\S+\s+\S+\s+\S+\s+\S+\s*$/;
const MAX_CATCH_UP_STEPS = 10_000;

export function assertValidCronExpression(expression: string): string {
  const trimmed = expression.trim();
  if (!FIVE_FIELD_CRON.test(trimmed)) {
    throw new ValidationError(
      'Cron expression must have 5 fields (minute hour day-of-month month day-of-week)',
      {
        details: { expression },
      },
    );
  }
  try {
    CronExpressionParser.parse(trimmed, { tz: 'UTC' });
  } catch (error) {
    throw new ValidationError('Invalid cron expression', {
      cause: error,
      details: { expression },
    });
  }
  return trimmed;
}

export function nextOccurrenceAfter(expression: string, timezone: string, after: Date): Date {
  const cron = assertValidCronExpression(expression);
  try {
    const interval = CronExpressionParser.parse(cron, {
      currentDate: after,
      tz: timezone,
    });
    return interval.next().toDate();
  } catch (error) {
    throw new ValidationError('Invalid cron expression or timezone', {
      cause: error,
      details: { expression, timezone },
    });
  }
}

/**
 * First occurrence strictly after `after` that is also strictly after `now`.
 * Used so a scheduler that was down does not enqueue every missed slot.
 */
export function nextRunAtAfterCatchUp(
  expression: string,
  timezone: string,
  after: Date,
  now: Date,
): Date {
  let next = nextOccurrenceAfter(expression, timezone, after);
  let steps = 0;
  while (next.getTime() <= now.getTime()) {
    next = nextOccurrenceAfter(expression, timezone, next);
    steps += 1;
    if (steps > MAX_CATCH_UP_STEPS) {
      throw new ValidationError('Failed to advance next_run_at past now', {
        details: { expression, timezone },
      });
    }
  }
  return next;
}
