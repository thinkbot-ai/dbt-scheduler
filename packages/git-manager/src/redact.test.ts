import { describe, expect, it } from 'vitest';
import { redactSecrets } from './redact.js';

describe('redactSecrets', () => {
  it('removes tokens from URLs, headers, and known GitHub prefixes', () => {
    const input = [
      'Cloning into https://x-access-token:ghp_secretvalue@github.com/acme/analytics.git',
      'Authorization: Basic abcdef==',
      'http.extraHeader=Authorization: Bearer ghs_secret',
      'token ghp_ABCDEFG123',
    ].join('\n');

    const redacted = redactSecrets(input);
    expect(redacted).not.toContain('ghp_secretvalue');
    expect(redacted).not.toContain('abcdef==');
    expect(redacted).not.toContain('ghs_secret');
    expect(redacted).not.toContain('ghp_ABCDEFG123');
    expect(redacted).toContain('[redacted]');
  });
});
