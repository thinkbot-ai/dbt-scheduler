import type { ProjectSourceMode } from '@dbt-scheduler/types';
import { DatabaseError } from '@dbt-scheduler/types';
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { wrapDatabaseError } from '../errors.js';
import { projects } from '../schema/projects.js';

export type Project = typeof projects.$inferSelect;

export interface CreateProjectInput {
  name: string;
  repositoryUrl: string;
  description?: string | null;
  branch?: string;
  sourceMode?: ProjectSourceMode;
  projectPath?: string;
  environment?: string;
  dbtVersion?: string | null;
  dbtAdapterVersion?: string | null;
  credentialsReference?: string | null;
  enabled?: boolean;
  maxConcurrentJobs?: number;
}

export interface UpdateProjectInput {
  name?: string;
  repositoryUrl?: string;
  description?: string | null;
  branch?: string;
  sourceMode?: ProjectSourceMode;
  projectPath?: string;
  environment?: string;
  dbtVersion?: string | null;
  dbtAdapterVersion?: string | null;
  credentialsReference?: string | null;
  enabled?: boolean;
  maxConcurrentJobs?: number;
}

export class ProjectsRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: CreateProjectInput): Promise<Project> {
    try {
      const [row] = await this.db.insert(projects).values(input).returning();
      if (!row) {
        throw new DatabaseError('Project insert returned no row');
      }
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to create project');
    }
  }

  async getById(id: string): Promise<Project | undefined> {
    try {
      const [row] = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to load project');
    }
  }

  async list(): Promise<Project[]> {
    try {
      return await this.db.select().from(projects);
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to list projects');
    }
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project | undefined> {
    try {
      const [row] = await this.db
        .update(projects)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to update project');
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const deleted = await this.db.delete(projects).where(eq(projects.id, id)).returning();
      return deleted.length > 0;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to delete project');
    }
  }
}
