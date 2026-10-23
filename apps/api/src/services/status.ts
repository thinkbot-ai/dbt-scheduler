import {
  JobRunsRepository,
  WorkersRepository,
  type Database,
  type Worker,
} from '@dbt-scheduler/database';
import { JOB_STATUSES, type JobStatus } from '@dbt-scheduler/types';

export class StatusService {
  constructor(private readonly db: Database) {}

  async workers(): Promise<Worker[]> {
    return new WorkersRepository(this.db).list();
  }

  async system(maxConcurrentJobs: number): Promise<{
    status: 'ok';
    maxConcurrentJobs: number;
    jobs: Record<JobStatus, number>;
    workers: { total: number; running: number; idle: number };
  }> {
    const jobsRepo = new JobRunsRepository(this.db);
    const jobs = {} as Record<JobStatus, number>;
    for (const status of JOB_STATUSES) {
      jobs[status] = await jobsRepo.countByStatuses([status]);
    }
    const workers = await new WorkersRepository(this.db).list();
    return {
      status: 'ok',
      maxConcurrentJobs,
      jobs,
      workers: {
        total: workers.length,
        running: workers.filter((worker) => worker.status === 'RUNNING').length,
        idle: workers.filter((worker) => worker.status === 'IDLE').length,
      },
    };
  }
}
