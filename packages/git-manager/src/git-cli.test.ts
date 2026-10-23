import { GitError } from '@dbt-scheduler/types';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runGit, type GitSpawnFn } from './git-cli.js';

const FAKE_GIT = fileURLToPath(new URL('./__fixtures__/fake-git.mjs', import.meta.url));

const fakeGitSpawn: GitSpawnFn = (bin, argv, options) =>
  spawn(bin, [FAKE_GIT, ...argv], {
    env: options.env,
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

describe('runGit', () => {
  it('passes http.extraHeader instead of embedding the token in the URL', async () => {
    const result = await runGit({
      gitBin: process.execPath,
      args: ['clone', '--', 'https://github.com/acme/analytics.git', '/tmp/dest'],
      token: 'ghp_testtoken_not_real',
      spawn: fakeGitSpawn,
    });

    expect(result.stdout).toContain('http.extraHeader=');
    expect(result.stdout).not.toContain('ghp_testtoken_not_real');
    expect(result.stdout).toContain('https://github.com/acme/analytics.git');
  });

  it('never includes the token in GitError output', async () => {
    const token = 'ghp_should_never_leak';
    const spawnWithFailure: GitSpawnFn = (bin, argv, options) =>
      spawn(bin, [FAKE_GIT, ...argv], {
        env: { ...options.env, FAKE_GIT_EXIT_CODE: '1', FAKE_GIT_STDERR: `fatal: ${token}` },
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

    try {
      await runGit({
        gitBin: process.execPath,
        args: ['clone', '--', 'https://github.com/acme/analytics.git', '/tmp/dest'],
        token,
        spawn: spawnWithFailure,
      });
      throw new Error('expected GitError');
    } catch (error) {
      expect(error).toBeInstanceOf(GitError);
      const gitError = error as GitError;
      expect(gitError.message).not.toContain(token);
      expect(JSON.stringify(gitError.details)).not.toContain(token);
    }
  });
});
