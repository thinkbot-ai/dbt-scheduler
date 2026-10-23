import { GitError } from '@dbt-scheduler/types';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupExpiredWorkspaces } from './cleanup.js';
import { runGit } from './git-cli.js';
import { prepareJobRepository } from './prepare.js';
import {
  checkoutBranch,
  cloneRepository,
  fetchRepository,
  getCommitSha,
  resetToRemote,
} from './repository.js';

async function createOrigin(
  root: string,
  branch = 'main',
): Promise<{ origin: string; sha: string }> {
  const origin = path.join(root, 'origin.git');
  await mkdir(origin, { recursive: true });
  const git = (args: string[]) => runGit({ args, cwd: origin, timeoutMs: 30_000 });
  await git(['init', '-b', branch]);
  await git(['config', 'user.email', 'scheduler@example.test']);
  await git(['config', 'user.name', 'DBT Scheduler Tests']);
  await writeFile(path.join(origin, 'README.md'), 'origin\n', 'utf8');
  await git(['add', 'README.md']);
  await git(['commit', '-m', 'initial']);
  const sha = await getCommitSha({ cwd: origin, timeoutMs: 30_000 });
  return { origin, sha };
}

describe('git repository operations', { timeout: 30_000 }, () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'git-manager-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  });

  it('clones a branch, reports the commit SHA, and isolates job workspaces', async () => {
    const { origin, sha } = await createOrigin(root);
    const first = await prepareJobRepository({
      workspaceRoot: path.join(root, 'workspaces'),
      jobRunId: '1001',
      repositoryUrl: origin,
      branch: 'main',
      timeoutMs: 30_000,
    });
    const second = await prepareJobRepository({
      workspaceRoot: path.join(root, 'workspaces'),
      jobRunId: '1002',
      repositoryUrl: origin,
      branch: 'main',
      timeoutMs: 30_000,
    });

    expect(first.commitSha).toBe(sha);
    expect(second.commitSha).toBe(sha);
    expect(first.workspacePath).not.toBe(second.workspacePath);
    expect(first.workspacePath).toContain('job-1001');
  });

  it('fetches and resets to the remote instead of pulling a dirty tree', async () => {
    const { origin } = await createOrigin(root);
    const destination = path.join(root, 'checkout');
    await cloneRepository({
      repositoryUrl: origin,
      destination,
      branch: 'main',
      timeoutMs: 30_000,
    });
    await writeFile(path.join(destination, 'dirty.txt'), 'local change\n', 'utf8');

    await writeFile(path.join(origin, 'README.md'), 'updated\n', 'utf8');
    await runGit({ args: ['add', 'README.md'], cwd: origin, timeoutMs: 30_000 });
    await runGit({ args: ['commit', '-m', 'update'], cwd: origin, timeoutMs: 30_000 });
    const originSha = await getCommitSha({ cwd: origin, timeoutMs: 30_000 });

    await fetchRepository({ cwd: destination, timeoutMs: 30_000 });
    await checkoutBranch({ cwd: destination, branch: 'main', timeoutMs: 30_000 });
    await resetToRemote({ cwd: destination, branch: 'main', timeoutMs: 30_000 });

    expect(await getCommitSha({ cwd: destination, timeoutMs: 30_000 })).toBe(originSha);
    await expect(rm(path.join(destination, 'dirty.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rebuilds a workspace when prepare is called again for the same job', async () => {
    const { origin } = await createOrigin(root);
    const options = {
      workspaceRoot: path.join(root, 'workspaces'),
      jobRunId: 'repeat',
      repositoryUrl: origin,
      branch: 'main',
      timeoutMs: 30_000,
    };
    const first = await prepareJobRepository(options);
    await writeFile(path.join(first.workspacePath, 'scratch.txt'), 'stale\n', 'utf8');
    const second = await prepareJobRepository(options);
    expect(second.workspacePath).toBe(first.workspacePath);
    await expect(rm(path.join(second.workspacePath, 'scratch.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects an unsafe branch before spawning git', async () => {
    await expect(
      cloneRepository({
        repositoryUrl: path.join(root, 'origin.git'),
        destination: path.join(root, 'dest'),
        branch: 'main;touch-pwned',
        timeoutMs: 5_000,
      }),
    ).rejects.toBeInstanceOf(GitError);
  });

  it('removes workspaces older than the retention window', async () => {
    const workspaces = path.join(root, 'workspaces');
    const stale = path.join(workspaces, 'job-old');
    const fresh = path.join(workspaces, 'job-new');
    await mkdir(stale, { recursive: true });
    await mkdir(fresh, { recursive: true });
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(stale, twoDaysAgo, twoDaysAgo);

    const result = await cleanupExpiredWorkspaces({
      workspaceRoot: workspaces,
      retentionHours: 24,
    });

    expect(result.removed).toContain(path.resolve(stale));
    expect(result.kept).toContain(path.resolve(fresh));
  });
});
