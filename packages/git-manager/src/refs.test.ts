import { GitError } from '@dbt-scheduler/types';
import { describe, expect, it } from 'vitest';
import { parseRepositoryUrl, validateCommitSha, validateGitRefName } from './refs.js';

describe('validateGitRefName', () => {
  it('accepts a normal branch', () => {
    expect(validateGitRefName('main', 'branch')).toBe('main');
    expect(validateGitRefName('feature/hourly-refresh', 'branch')).toBe('feature/hourly-refresh');
  });

  it('rejects option-like and path-traversal refs', () => {
    expect(() => validateGitRefName('--upload-pack', 'branch')).toThrow(GitError);
    expect(() => validateGitRefName('../main', 'branch')).toThrow(GitError);
    expect(() => validateGitRefName('main;rm', 'branch')).toThrow(GitError);
  });
});

describe('validateCommitSha', () => {
  it('accepts hex SHAs', () => {
    expect(validateCommitSha('8f12ab32')).toBe('8f12ab32');
  });

  it('rejects non-hex values', () => {
    expect(() => validateCommitSha('main')).toThrow(GitError);
    expect(() => validateCommitSha('HEAD;cat')).toThrow(GitError);
  });
});

describe('parseRepositoryUrl', () => {
  it('strips embedded HTTPS credentials', () => {
    const parsed = parseRepositoryUrl(
      'https://x-access-token:ghp_secret@github.com/acme/analytics.git',
    );
    expect(parsed.kind).toBe('https');
    expect(parsed.url).toBe('https://github.com/acme/analytics.git');
    expect(parsed.url).not.toContain('ghp_secret');
  });

  it('accepts SSH and local paths', () => {
    expect(parseRepositoryUrl('git@github.com:acme/analytics.git').kind).toBe('ssh');
    expect(parseRepositoryUrl('file:///tmp/origin.git').kind).toBe('local');
  });

  it('rejects shell metacharacters and non-https remotes', () => {
    expect(() => parseRepositoryUrl('https://github.com/acme/analytics.git; rm -rf /')).toThrow(
      GitError,
    );
    expect(() => parseRepositoryUrl('http://github.com/acme/analytics.git')).toThrow(GitError);
  });
});
