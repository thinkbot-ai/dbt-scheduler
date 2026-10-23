import {
  ProjectsRepository,
  type CreateProjectInput,
  type Database,
  type Project,
  type UpdateProjectInput,
} from '@dbt-scheduler/database';
import {
  parseRepositoryUrl,
  validateGitRefName,
  type ParsedRepositoryUrl,
} from '@dbt-scheduler/git-manager';
import { GitError, NotFoundError, ValidationError } from '@dbt-scheduler/types';
import type { CreateProjectBody, UpdateProjectBody } from '@dbt-scheduler/validation';

export class ProjectService {
  constructor(private readonly db: Database) {}

  async list(): Promise<Project[]> {
    return new ProjectsRepository(this.db).list();
  }

  async get(id: string): Promise<Project> {
    const project = await new ProjectsRepository(this.db).getById(id);
    if (!project) {
      throw new NotFoundError('Project not found', { details: { id } });
    }
    return project;
  }

  async create(body: CreateProjectBody): Promise<Project> {
    return new ProjectsRepository(this.db).create(toCreateInput(body));
  }

  async update(id: string, body: UpdateProjectBody): Promise<Project> {
    const current = await this.get(id);
    const updated = await new ProjectsRepository(this.db).update(id, toUpdateInput(body, current));
    if (!updated) {
      throw new NotFoundError('Project not found', { details: { id } });
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    const deleted = await new ProjectsRepository(this.db).delete(id);
    if (!deleted) {
      throw new NotFoundError('Project not found', { details: { id } });
    }
  }
}

function toCreateInput(body: CreateProjectBody): CreateProjectInput {
  const parsed = parseSafeRepositoryUrl(body.repositoryUrl);
  if (body.sourceMode === 'local_directory' && parsed.kind !== 'local') {
    throw new ValidationError(
      'repositoryUrl must be an absolute local path when sourceMode is local_directory',
      { details: { repositoryUrl: body.repositoryUrl } },
    );
  }
  return {
    name: body.name,
    repositoryUrl: parsed.url,
    sourceMode: body.sourceMode,
    projectPath: body.projectPath,
    environment: body.environment,
    enabled: body.enabled,
    maxConcurrentJobs: body.maxConcurrentJobs,
    ...(body.sourceMode === 'local_directory'
      ? {}
      : { branch: validateGitRefName(body.branch ?? 'main', 'branch') }),
    ...(body.description === undefined ? {} : { description: body.description }),
    ...(body.dbtVersion === undefined ? {} : { dbtVersion: body.dbtVersion }),
    ...(body.dbtAdapterVersion === undefined ? {} : { dbtAdapterVersion: body.dbtAdapterVersion }),
    ...(body.credentialsReference === undefined
      ? {}
      : { credentialsReference: body.credentialsReference }),
  };
}

function toUpdateInput(body: UpdateProjectBody, current: Project): UpdateProjectInput {
  const effectiveSourceMode = body.sourceMode ?? current.sourceMode;
  const parsedRepositoryUrl =
    body.repositoryUrl === undefined ? undefined : parseSafeRepositoryUrl(body.repositoryUrl);
  const effectiveRepositoryKind =
    parsedRepositoryUrl?.kind ?? parseSafeRepositoryUrl(current.repositoryUrl).kind;

  if (effectiveSourceMode === 'local_directory' && effectiveRepositoryKind !== 'local') {
    throw new ValidationError(
      'repositoryUrl must be an absolute local path when sourceMode is local_directory',
      { details: { repositoryUrl: body.repositoryUrl ?? current.repositoryUrl } },
    );
  }

  return {
    ...(body.name === undefined ? {} : { name: body.name }),
    ...(parsedRepositoryUrl === undefined ? {} : { repositoryUrl: parsedRepositoryUrl.url }),
    ...(body.sourceMode === undefined ? {} : { sourceMode: body.sourceMode }),
    ...(effectiveSourceMode === 'local_directory' || body.branch === undefined
      ? {}
      : { branch: validateGitRefName(body.branch, 'branch') }),
    ...(body.projectPath === undefined ? {} : { projectPath: body.projectPath }),
    ...(body.environment === undefined ? {} : { environment: body.environment }),
    ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
    ...(body.maxConcurrentJobs === undefined ? {} : { maxConcurrentJobs: body.maxConcurrentJobs }),
    ...(body.description === undefined ? {} : { description: body.description }),
    ...(body.dbtVersion === undefined ? {} : { dbtVersion: body.dbtVersion }),
    ...(body.dbtAdapterVersion === undefined ? {} : { dbtAdapterVersion: body.dbtAdapterVersion }),
    ...(body.credentialsReference === undefined
      ? {}
      : { credentialsReference: body.credentialsReference }),
  };
}

function parseSafeRepositoryUrl(repositoryUrl: string): ParsedRepositoryUrl {
  try {
    return parseRepositoryUrl(repositoryUrl);
  } catch (error) {
    if (error instanceof GitError) {
      throw new ValidationError(error.message, { details: { ...error.details } });
    }
    throw error;
  }
}
