import { GitError } from '@dbt-scheduler/types';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertPathInsideRoot, buildJobWorkspacePath, sanitizeJobRunId } from './workspace.js';

describe('buildJobWorkspacePath', () => {
  it('creates an isolated workspace per job', () => {
    expect(buildJobWorkspacePath('/workspaces', '1001')).toBe(
      path.resolve('/workspaces', 'job-1001'),
    );
    expect(buildJobWorkspacePath('/workspaces', '1001')).not.toBe(
      buildJobWorkspacePath('/workspaces', '1002'),
    );
  });

  it('rejects path traversal in job ids', () => {
    expect(buildJobWorkspacePath('/workspaces', '../etc')).toBe(
      path.resolve('/workspaces', 'job-etc'),
    );
  });

  it('rejects empty sanitized ids', () => {
    expect(() => sanitizeJobRunId('...')).toThrow(GitError);
  });
});

describe('assertPathInsideRoot', () => {
  it('allows paths under the workspace root', () => {
    expect(assertPathInsideRoot('/workspaces', '/workspaces/job-1')).toBe(
      path.resolve('/workspaces/job-1'),
    );
  });

  it('rejects paths that escape the workspace root', () => {
    expect(() => assertPathInsideRoot('/workspaces', '/workspaces/../etc')).toThrow(GitError);
  });
});
