import { runGit, type RunGitOptions } from './git-cli.js';
import { parseRepositoryUrl, validateCommitSha, validateGitRefName } from './refs.js';

type GitCallOptions = Pick<
  RunGitOptions,
  'gitBin' | 'token' | 'timeoutMs' | 'signal' | 'spawn' | 'parentEnv' | 'gracefulShutdownMs'
>;

export interface CloneRepositoryOptions extends GitCallOptions {
  repositoryUrl: string;
  destination: string;
  branch: string;
}

export interface RepositoryLocationOptions extends GitCallOptions {
  cwd: string;
}

export interface CheckoutBranchOptions extends RepositoryLocationOptions {
  branch: string;
}

export interface ResetToRemoteOptions extends RepositoryLocationOptions {
  branch: string;
}

export interface CheckoutCommitOptions extends RepositoryLocationOptions {
  commitSha: string;
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

export async function cloneRepository(options: CloneRepositoryOptions): Promise<void> {
  const branch = validateGitRefName(options.branch, 'branch');
  const repository = parseRepositoryUrl(options.repositoryUrl);
  await runGit({
    ...callOptions(options),
    args: [
      'clone',
      '--origin',
      'origin',
      '--branch',
      branch,
      '--single-branch',
      '--',
      repository.url,
      options.destination,
    ],
  });
}

export async function fetchRepository(options: RepositoryLocationOptions): Promise<void> {
  await runGit({
    ...callOptions(options),
    cwd: options.cwd,
    args: ['fetch', '--prune', '--', 'origin'],
  });
}

export async function checkoutBranch(options: CheckoutBranchOptions): Promise<void> {
  const branch = validateGitRefName(options.branch, 'branch');
  await runGit({
    ...callOptions(options),
    cwd: options.cwd,
    args: ['checkout', '--force', branch],
  });
}

export async function resetToRemote(options: ResetToRemoteOptions): Promise<void> {
  const branch = validateGitRefName(options.branch, 'branch');
  await fetchRepository(options);
  await checkoutBranch({ ...options, branch });
  await runGit({
    ...callOptions(options),
    cwd: options.cwd,
    args: ['reset', '--hard', `origin/${branch}`],
  });
  await runGit({
    ...callOptions(options),
    cwd: options.cwd,
    args: ['clean', '-ffd'],
  });
}

export async function checkoutCommit(options: CheckoutCommitOptions): Promise<void> {
  const commitSha = validateCommitSha(options.commitSha);
  await runGit({
    ...callOptions(options),
    cwd: options.cwd,
    args: ['checkout', '--force', '--detach', commitSha],
  });
  await runGit({
    ...callOptions(options),
    cwd: options.cwd,
    args: ['clean', '-ffd'],
  });
}

export async function getCommitSha(options: RepositoryLocationOptions): Promise<string> {
  const result = await runGit({
    ...callOptions(options),
    cwd: options.cwd,
    args: ['rev-parse', 'HEAD'],
  });
  return result.stdout.trim();
}
