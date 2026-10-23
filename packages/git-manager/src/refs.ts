import { GitError } from '@dbt-scheduler/types';
import path from 'node:path';

const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;
const UNSAFE_REMOTE_CHARS = /[\s;|&$`]/;
const UNSAFE_LOCAL_CHARS = /[;|&$`]/;

export type RepositoryKind = 'https' | 'ssh' | 'local';

export interface ParsedRepositoryUrl {
  kind: RepositoryKind;
  /** Credential-free URL or filesystem path passed to git. */
  url: string;
}

export function validateGitRefName(name: string, label: string): string {
  const trimmed = name.trim();
  if (!BRANCH_PATTERN.test(trimmed) || trimmed.includes('..') || trimmed.includes('//')) {
    throw new GitError(`Invalid ${label}`, { details: { [label]: trimmed } });
  }
  return trimmed;
}

export function validateCommitSha(sha: string): string {
  const trimmed = sha.trim().toLowerCase();
  if (!SHA_PATTERN.test(trimmed)) {
    throw new GitError('Invalid commit SHA', { details: { sha: trimmed } });
  }
  return trimmed;
}

export function parseRepositoryUrl(raw: string): ParsedRepositoryUrl {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new GitError('Invalid repository URL');
  }

  if (trimmed.startsWith('file:') || path.isAbsolute(trimmed)) {
    if (UNSAFE_LOCAL_CHARS.test(trimmed)) {
      throw new GitError('Invalid local repository path');
    }
    return { kind: 'local', url: trimmed };
  }

  if (UNSAFE_REMOTE_CHARS.test(trimmed)) {
    throw new GitError('Invalid repository URL');
  }

  if (trimmed.startsWith('git@')) {
    if (!/^git@[A-Za-z0-9.-]+:[A-Za-z0-9._/\-~]+(?:\.git)?$/.test(trimmed)) {
      throw new GitError('Invalid SSH repository URL');
    }
    return { kind: 'ssh', url: trimmed };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new GitError('Invalid repository URL');
  }

  if (parsed.protocol === 'file:') {
    return { kind: 'local', url: parsed.toString() };
  }

  if (parsed.protocol !== 'https:') {
    throw new GitError('Repository URL must use https, SSH, or a local path', {
      details: { protocol: parsed.protocol },
    });
  }

  parsed.username = '';
  parsed.password = '';
  return { kind: 'https', url: parsed.toString() };
}

export function githubAuthorizationHeader(token: string): string {
  const encoded = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
  return `Authorization: Basic ${encoded}`;
}
