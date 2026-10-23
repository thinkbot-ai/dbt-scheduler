import { GitError } from '@dbt-scheduler/types';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCommitSha } from './repository.js';
import { runGit } from './git-cli.js';
import { getRemoteHeadCommitSha } from './remote-status.js';

async function createOrigin(root: string, branch = 'main'): Promise<string> {
  const origin = path.join(root, 'origin.git');
  await mkdir(origin, { recursive: true });
  const git = (args: string[]) => runGit({ args, cwd: origin, timeoutMs: 30_000 });
  await git(['init', '-b', branch]);
  await git(['config', 'user.email', 'scheduler@example.test']);
  await git(['config', 'user.name', 'DBT Scheduler Tests']);
  await writeFile(path.join(origin, 'README.md'), 'origin\n', 'utf8');
  await git(['add', 'README.md']);
  await git(['commit', '-m', 'initial']);
  return origin;
}

describe('getRemoteHeadCommitSha', { timeout: 30_000 }, () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'git-manager-remote-status-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  });

  it('returns the current HEAD sha for a local repo path', async () => {
    const origin = await createOrigin(root);
    const expected = await getCommitSha({ cwd: origin, timeoutMs: 30_000 });

    const sha = await getRemoteHeadCommitSha({
      repositoryUrl: origin,
      branch: 'main',
      timeoutMs: 30_000,
    });

    expect(sha).toBe(expected);
  });

  it('returns a different sha after a new commit', async () => {
    const origin = await createOrigin(root);
    const before = await getRemoteHeadCommitSha({
      repositoryUrl: origin,
      branch: 'main',
      timeoutMs: 30_000,
    });

    await writeFile(path.join(origin, 'README.md'), 'updated\n', 'utf8');
    await runGit({ args: ['add', 'README.md'], cwd: origin, timeoutMs: 30_000 });
    await runGit({ args: ['commit', '-m', 'update'], cwd: origin, timeoutMs: 30_000 });

    const after = await getRemoteHeadCommitSha({
      repositoryUrl: origin,
      branch: 'main',
      timeoutMs: 30_000,
    });

    expect(after).toBeDefined();
    expect(after).not.toBe(before);
  });

  it('returns undefined for a branch that does not exist', async () => {
    const origin = await createOrigin(root);

    const sha = await getRemoteHeadCommitSha({
      repositoryUrl: origin,
      branch: 'does-not-exist',
      timeoutMs: 30_000,
    });

    expect(sha).toBeUndefined();
  });

  it('throws GitError for an invalid branch name', async () => {
    const origin = await createOrigin(root);

    await expect(
      getRemoteHeadCommitSha({
        repositoryUrl: origin,
        branch: 'main;touch-pwned',
        timeoutMs: 5_000,
      }),
    ).rejects.toBeInstanceOf(GitError);
  });
});
