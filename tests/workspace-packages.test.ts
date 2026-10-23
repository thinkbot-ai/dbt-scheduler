import { describe, expect, it } from 'vitest';
import { loadConfig } from '@dbt-scheduler/config';
import { TABLES, ProjectsRepository } from '@dbt-scheduler/database';
import { createDbtSpawnPlan } from '@dbt-scheduler/dbt-runner';
import { buildJobWorkspacePath } from '@dbt-scheduler/git-manager';
import { CLAIM_JOB_SQL, JobQueue, canTransition } from '@dbt-scheduler/job-queue';
import { SECRET_REDACT_PATHS } from '@dbt-scheduler/logging';
import { CRON_PRESETS, isScheduleDue } from '@dbt-scheduler/scheduler-core';
import { JOB_PRIORITIES } from '@dbt-scheduler/types';
import { buildDbtArgv } from '@dbt-scheduler/validation';

describe('workspace packages', () => {
  it('resolve shared packages without circular imports', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler',
    });

    expect(config.PROCESS_ROLE).toBe('api');
    expect(TABLES.jobRuns).toBe('job_runs');
    expect(typeof ProjectsRepository).toBe('function');
    expect(createDbtSpawnPlan({ bin: 'dbt', command: 'build', cwd: '/tmp' }).argv).toEqual([
      'build',
    ]);
    expect(buildJobWorkspacePath('/workspaces', '42')).toContain('job-42');
    expect(typeof JobQueue).toBe('function');
    expect(CLAIM_JOB_SQL).toContain('FOR UPDATE SKIP LOCKED');
    expect(canTransition('QUEUED', 'RUNNING')).toBe(true);
    expect(SECRET_REDACT_PATHS).toContain('GIT_TOKEN');
    expect(isScheduleDue(new Date(0), new Date(1))).toBe(true);
    expect(CRON_PRESETS.every_hour).toBe('0 * * * *');
    expect(JOB_PRIORITIES.NORMAL).toBe(3);
    expect(buildDbtArgv('test')).toEqual(['test']);
  });
});
