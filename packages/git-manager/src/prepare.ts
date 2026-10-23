import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  checkoutCommit,
  cloneRepository,
  getCommitSha,
  resetToRemote,
  type CloneRepositoryOptions,
} from './repository.js';
import {
  assertPathInsideRoot,
  buildJobWorkspacePath,
  WORKSPACE_MARKER_FILENAME,
  type WorkspaceMarker,
} from './workspace.js';

export interface PrepareJobRepositoryOptions extends Omit<CloneRepositoryOptions, 'destination'> {
  workspaceRoot: string;
  jobRunId: string;
  /** When set, check out this commit after cloning the branch. */
  commitSha?: string;
}

export interface PreparedJobRepository {
  workspacePath: string;
  repositoryUrl: string;
  branch: string;
  commitSha: string;
}

/**
 * Creates a unique Git working tree for one job. The directory is always
 * rebuilt so two workers never share `.git` or `target/`.
 */
export async function prepareJobRepository(
  options: PrepareJobRepositoryOptions,
): Promise<PreparedJobRepository> {
  const workspacePath = assertPathInsideRoot(
    options.workspaceRoot,
    buildJobWorkspacePath(options.workspaceRoot, options.jobRunId),
  );

  await mkdir(options.workspaceRoot, { recursive: true });
  await rm(workspacePath, { recursive: true, force: true });

  const cloneOptions: CloneRepositoryOptions = {
    repositoryUrl: options.repositoryUrl,
    destination: workspacePath,
    branch: options.branch,
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

  await cloneRepository(cloneOptions);

  if (options.commitSha !== undefined) {
    await checkoutCommit({ ...cloneOptions, cwd: workspacePath, commitSha: options.commitSha });
  } else {
    await resetToRemote({ ...cloneOptions, cwd: workspacePath, branch: options.branch });
  }

  const commitSha = await getCommitSha({ ...cloneOptions, cwd: workspacePath });
  const marker: WorkspaceMarker = {
    jobRunId: options.jobRunId,
    repositoryUrl: options.repositoryUrl,
    branch: options.branch,
    commitSha,
    createdAt: new Date().toISOString(),
  };
  await writeFile(
    path.join(workspacePath, WORKSPACE_MARKER_FILENAME),
    `${JSON.stringify(marker, null, 2)}\n`,
    'utf8',
  );

  return {
    workspacePath,
    repositoryUrl: options.repositoryUrl,
    branch: options.branch,
    commitSha,
  };
}
