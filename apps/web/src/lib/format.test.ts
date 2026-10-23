import { describe, expect, it } from 'vitest';
import {
  formatAgo,
  formatDateTime,
  formatDuration,
  isWorkerOnline,
  priorityLabel,
  shortSha,
} from './format.ts';

describe('format helpers', () => {
  it('formats duration and short SHAs', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(250)).toBe('250 ms');
    expect(formatDuration(12_000)).toBe('12s');
    expect(formatDuration(125_000)).toBe('2m 5s');
    expect(shortSha(null)).toBe('—');
    expect(shortSha('abcdef123456')).toBe('abcdef12');
    expect(priorityLabel(2)).toBe('HIGH');
    expect(formatDateTime(null)).toBe('—');
  });

  it('classifies recent workers as online', () => {
    const now = Date.parse('2026-08-26T18:00:00.000Z');
    expect(isWorkerOnline('IDLE', '2026-08-26T17:59:30.000Z', now)).toBe(true);
    expect(isWorkerOnline('IDLE', '2026-08-26T17:50:00.000Z', now)).toBe(false);
    expect(isWorkerOnline('STOPPED', '2026-08-26T17:59:30.000Z', now)).toBe(false);
    expect(formatAgo('2026-08-26T17:59:50.000Z', now)).toBe('just now');
  });
});
