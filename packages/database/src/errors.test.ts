import { describe, expect, it } from 'vitest';
import { isUniqueViolation, redactDatabaseErrorMessage } from './errors.js';

describe('database error helpers', () => {
  it('redacts postgres connection strings', () => {
    expect(
      redactDatabaseErrorMessage(
        'connect failed postgres://dbt_scheduler:super-secret@localhost:5432/dbt_scheduler',
      ),
    ).toBe('connect failed postgres://[redacted]');
  });

  it('detects unique violations', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ message: 'duplicate key value violates unique constraint' })).toBe(
      true,
    );
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(
      isUniqueViolation({
        message: 'Failed query: insert into schedule_execution_keys',
        cause: { code: '23505' },
      }),
    ).toBe(true);
  });
});
