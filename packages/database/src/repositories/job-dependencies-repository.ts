import { DatabaseError } from '@dbt-scheduler/types';
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { wrapDatabaseError } from '../errors.js';
import { jobDependencies } from '../schema/job-dependencies.js';

export type JobDependency = typeof jobDependencies.$inferSelect;

export interface CreateJobDependencyInput {
  jobRunId: string;
  dependsOnJobRunId: string;
}

export class JobDependenciesRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: CreateJobDependencyInput): Promise<JobDependency> {
    try {
      const [row] = await this.db.insert(jobDependencies).values(input).returning();
      if (!row) {
        throw new DatabaseError('Job dependency insert returned no row');
      }
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to create job dependency');
    }
  }

  async listByJobRun(jobRunId: string): Promise<JobDependency[]> {
    try {
      return await this.db
        .select()
        .from(jobDependencies)
        .where(eq(jobDependencies.jobRunId, jobRunId));
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to list job dependencies');
    }
  }
}
