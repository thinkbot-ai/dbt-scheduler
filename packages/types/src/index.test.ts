import { describe, expect, it } from 'vitest';
import { ConfigurationError, JOB_PRIORITIES, isJobPriority, isJobStatus } from './index.js';

describe('domain types', () => {
  it('identifies valid job statuses', () => {
    expect(isJobStatus('QUEUED')).toBe(true);
    expect(isJobStatus('queued')).toBe(false);
  });

  it('identifies valid priorities', () => {
    expect(isJobPriority(JOB_PRIORITIES.CRITICAL)).toBe(true);
    expect(isJobPriority(9)).toBe(false);
  });

  it('creates structured errors without leaking extra fields', () => {
    const error = new ConfigurationError('missing DATABASE_URL', {
      details: { field: 'DATABASE_URL' },
    });

    expect(error.code).toBe('CONFIGURATION_ERROR');
    expect(error.details).toEqual({ field: 'DATABASE_URL' });
    expect(error.message).not.toMatch(/token|password|secret/i);
  });
});
