import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { assertPathInsideRoot } from './workspace.js';

export interface CleanupWorkspacesOptions {
  workspaceRoot: string;
  retentionHours: number;
  now?: Date;
}

export interface CleanupWorkspacesResult {
  removed: string[];
  kept: string[];
}

/**
 * Deletes job workspaces whose directory mtime is older than the retention
 * window. In-use workspaces stay because their mtime is refreshed during clone.
 */
export async function cleanupExpiredWorkspaces(
  options: CleanupWorkspacesOptions,
): Promise<CleanupWorkspacesResult> {
  const root = path.resolve(options.workspaceRoot);
  const now = options.now ?? new Date();
  const maxAgeMs = options.retentionHours * 60 * 60 * 1000;
  const removed: string[] = [];
  const kept: string[] = [];

  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (error) {
    if (isNotFound(error)) {
      return { removed, kept };
    }
    throw error;
  }

  for (const name of entries) {
    if (!name.startsWith('job-')) {
      continue;
    }
    const workspacePath = assertPathInsideRoot(root, path.join(root, name));
    const info = await stat(workspacePath);
    if (!info.isDirectory()) {
      continue;
    }
    if (now.getTime() - info.mtimeMs > maxAgeMs) {
      await rm(workspacePath, { recursive: true, force: true });
      removed.push(workspacePath);
    } else {
      kept.push(workspacePath);
    }
  }

  return { removed, kept };
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
