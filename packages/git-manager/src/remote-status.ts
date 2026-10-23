import { runGit, type RunGitOptions } from './git-cli.js';
import { parseRepositoryUrl, validateGitRefName } from './refs.js';

type GitCallOptions = Pick<
  RunGitOptions,
  'gitBin' | 'token' | 'timeoutMs' | 'signal' | 'spawn' | 'parentEnv' | 'gracefulShutdownMs'
>;

export interface GetRemoteHeadCommitShaOptions extends GitCallOptions {
  repositoryUrl: string;
  branch: string;
}

function callOptions(options: GitCallOptions): GitCallOptions {
  return {
    ...(options.gitBin === undefined ? {} : { gitBin: options.gitBin }),
    ...(options.token === undefined ? {} : { token: options.token }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.spawn === undefined ? {} : { spawn: options.spawn }),
    ...(options.parentEnv === undefined ? {} : { parentEnv: options.parentEnv }),
    ...(options.gracefulShutdownMs === undefined
      ? {}
      : { gracefulShutdownMs: options.gracefulShutdownMs }),
  };
}

/**
 * Reads the current HEAD commit SHA of `branch` without cloning, via
 * `git ls-remote`. Works uniformly for real remotes and local git repo paths
 * (git treats both as a "remote" transport for this command).
 */
export async function getRemoteHeadCommitSha(
  options: GetRemoteHeadCommitShaOptions,
): Promise<string | undefined> {
  const branch = validateGitRefName(options.branch, 'branch');
  const repository = parseRepositoryUrl(options.repositoryUrl);
  const result = await runGit({
    ...callOptions(options),
    args: ['ls-remote', '--', repository.url, `refs/heads/${branch}`],
  });
  const firstLine = result.stdout.split('\n').find((line) => line.trim().length > 0) ?? '';
  const sha = firstLine.split('\t')[0]?.trim();
  return sha === undefined || sha.length === 0 ? undefined : sha;
}
