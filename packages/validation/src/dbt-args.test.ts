import { ValidationError } from '@dbt-scheduler/types';
import { describe, expect, it } from 'vitest';
import { buildDbtArgv, parseDbtArguments } from './dbt-args.js';

describe('dbt argument validation', () => {
  it('builds a safe argv list for allowed commands', () => {
    expect(buildDbtArgv('build', ['--select', 'marts+'])).toEqual(['build', '--select', 'marts+']);
  });

  it('rejects unknown commands', () => {
    expect(() => buildDbtArgv('rm', [])).toThrow(ValidationError);
  });

  it('rejects shell metacharacters', () => {
    expect(() => parseDbtArguments(['--select', 'staging; cat /etc/passwd'])).toThrow(
      ValidationError,
    );
  });
});
