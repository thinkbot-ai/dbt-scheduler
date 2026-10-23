import { describe, expect, it } from 'vitest';
import { Writable } from 'node:stream';
import { pino } from 'pino';
import { SECRET_REDACT_PATHS } from './logger.js';

describe('logger redaction', () => {
  it('redacts secrets from structured logs', async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      },
    });

    const logger = pino(
      {
        redact: { paths: [...SECRET_REDACT_PATHS], censor: '[redacted]' },
      },
      stream,
    );

    logger.info({ GIT_TOKEN: 'ghp_example_not_real', job_id: 'job-1' }, 'job_started');

    await new Promise((resolve) => setImmediate(resolve));
    const output = chunks.join('');
    expect(output).toContain('[redacted]');
    expect(output).not.toContain('ghp_example_not_real');
    expect(output).toContain('job-1');
  });
});
