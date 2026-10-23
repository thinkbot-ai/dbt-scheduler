import {
  CONCURRENCY_POLICIES,
  DBT_COMMANDS,
  FAILURE_CLASSES,
  JOB_STATUSES,
  JOB_TRIGGER_TYPES,
  LOG_STREAMS,
  PROJECT_SOURCE_MODES,
  WORKER_STATUSES,
} from '@dbt-scheduler/types';
import { pgEnum } from 'drizzle-orm/pg-core';

export const jobStatusEnum = pgEnum('job_status', JOB_STATUSES);
export const workerStatusEnum = pgEnum('worker_status', WORKER_STATUSES);
export const concurrencyPolicyEnum = pgEnum('concurrency_policy', CONCURRENCY_POLICIES);
export const dbtCommandEnum = pgEnum('dbt_command', DBT_COMMANDS);
export const logStreamEnum = pgEnum('log_stream', LOG_STREAMS);
export const jobTriggerTypeEnum = pgEnum('job_trigger_type', JOB_TRIGGER_TYPES);
export const failureClassEnum = pgEnum('failure_class', FAILURE_CLASSES);
export const projectSourceModeEnum = pgEnum('project_source_mode', PROJECT_SOURCE_MODES);
