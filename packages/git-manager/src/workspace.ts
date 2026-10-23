import { GitError } from '@dbt-scheduler/types';
import path from 'node:path';

export const WORKSPACE_MARKER_FILENAME = '.dbt-scheduler-workspace.json';

const UNSAFE_JOB_ID = /[^A-Za-z0-9_-]/g;

export function sanitizeJobRunId(jobRunId: string): string {
  const sanitized = jobRunId.replace(UNSAFE_JOB_ID, '');
  if (sanitized.length === 0) {
    throw new GitError('jobRunId must contain at least one safe character');
  }
  return sanitized;
}

export function buildJobWorkspacePath(workspaceRoot: string, jobRunId: string): string {
  return path.resolve(workspaceRoot, `job-${sanitizeJobRunId(jobRunId)}`);
}

export function assertPathInsideRoot(workspaceRoot: string, targetPath: string): string {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(targetPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new GitError('Workspace path escapes WORKSPACE_ROOT');
  }
  return resolved;
}

export interface WorkspaceMarker {
  jobRunId: string;
  repositoryUrl: string;
  branch: string;
  commitSha: string;
  createdAt: string;
}
