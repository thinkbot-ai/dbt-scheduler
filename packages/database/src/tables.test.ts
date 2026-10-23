import { describe, expect, it } from 'vitest';
import { TABLES } from './tables.js';

describe('database table names', () => {
  it('uses the canonical PostgreSQL table names', () => {
    expect(TABLES.jobRuns).toBe('job_runs');
    expect(TABLES.scheduleExecutionKeys).toBe('schedule_execution_keys');
  });
});
