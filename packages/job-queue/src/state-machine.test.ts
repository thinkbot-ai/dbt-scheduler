import { JOB_PRIORITIES } from '@dbt-scheduler/types';
import { describe, expect, it } from 'vitest';
import { canTransition, compareQueueOrder, isTerminalStatus } from './state-machine.js';

describe('job state machine', () => {
  it('allows queued jobs to start or be cancelled', () => {
    expect(canTransition('QUEUED', 'RUNNING')).toBe(true);
    expect(canTransition('QUEUED', 'CANCELLED')).toBe(true);
    expect(canTransition('QUEUED', 'SUCCESS')).toBe(false);
  });

  it('marks completed statuses as terminal', () => {
    expect(isTerminalStatus('SUCCESS')).toBe(true);
    expect(isTerminalStatus('RUNNING')).toBe(false);
  });

  it('orders critical jobs ahead of older normal jobs', () => {
    const critical = {
      priority: JOB_PRIORITIES.CRITICAL,
      queuedAt: new Date('2026-08-25T12:00:00Z'),
    };
    const olderNormal = {
      priority: JOB_PRIORITIES.NORMAL,
      queuedAt: new Date('2026-08-25T11:00:00Z'),
    };
    expect(compareQueueOrder(critical, olderNormal)).toBeLessThan(0);
  });
});
