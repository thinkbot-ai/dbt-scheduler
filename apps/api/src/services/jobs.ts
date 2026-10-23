import {
  JobLogsRepository,
  JobRunsRepository,
  type Database,
  type JobLog,
  type JobRun,
} from '@dbt-scheduler/database';
import type { JobQueue } from '@dbt-scheduler/job-queue';
import { NotFoundError } from '@dbt-scheduler/types';
import type { ListJobsQuery } from '@dbt-scheduler/validation';

export class JobService {
  constructor(
    private readonly db: Database,
    private readonly queue: JobQueue,
  ) {}

  async list(query: ListJobsQuery): Promise<JobRun[]> {
    return new JobRunsRepository(this.db).list({
      limit: query.limit,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.scheduleId === undefined ? {} : { scheduleId: query.scheduleId }),
      ...(query.projectId === undefined ? {} : { projectId: query.projectId }),
    });
  }

  async get(id: string): Promise<JobRun> {
    const job = await new JobRunsRepository(this.db).getById(id);
    if (!job) {
      throw new NotFoundError('Job run not found', { details: { id } });
    }
    return job;
  }

  async logs(id: string, options: { afterSequence: number; limit: number }): Promise<JobLog[]> {
    await this.get(id);
    return new JobLogsRepository(this.db).listByJobRun(id, options);
  }

  async cancel(id: string): Promise<JobRun> {
    await this.get(id);
    return this.queue.cancel(id);
  }
}
