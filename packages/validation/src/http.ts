import {
  CONCURRENCY_POLICIES,
  JOB_PRIORITIES,
  JOB_STATUSES,
  PROJECT_SOURCE_MODES,
  type DbtCommand,
} from '@dbt-scheduler/types';
import { z } from 'zod';
import { dbtArgumentsSchema, dbtCommandSchema } from './dbt-args.js';

export const uuidParamSchema = z.string().uuid();

export const idParamsSchema = z.object({
  id: uuidParamSchema,
});

export const paginationLimitSchema = z.coerce.number().int().positive().max(500).default(100);

const branchSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
  .refine((value) => !value.includes('..') && !value.includes('//'), {
    message: 'Invalid git branch',
  });

const projectPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !value.includes('..'), { message: 'projectPath cannot contain ..' });

const projectBodyShape = z.object({
  name: z.string().trim().min(1).max(200),
  repositoryUrl: z.string().trim().min(1).max(2000),
  description: z.string().max(2000).nullable().optional(),
  sourceMode: z.enum(PROJECT_SOURCE_MODES).default('git'),
  // No .default('main') here: git mode falls back to the projects.branch DB
  // default; local_directory mode ignores branch entirely (see refineSourceMode).
  branch: branchSchema.optional(),
  projectPath: projectPathSchema.default('.'),
  environment: z.string().trim().min(1).max(64).default('prod'),
  dbtVersion: z.string().max(64).nullable().optional(),
  dbtAdapterVersion: z.string().max(64).nullable().optional(),
  credentialsReference: z.string().max(256).nullable().optional(),
  enabled: z.boolean().default(true),
  maxConcurrentJobs: z.number().int().positive().max(100).default(5),
});

function checkBranchNotUsedForLocalDirectory(
  value: { sourceMode?: string | undefined; branch?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (value.sourceMode === 'local_directory' && value.branch !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['branch'],
      message: 'branch is not used when sourceMode is local_directory',
    });
  }
}

export const createProjectBodySchema = projectBodyShape.superRefine(
  checkBranchNotUsedForLocalDirectory,
);

export const updateProjectBodySchema = projectBodyShape
  .partial()
  .superRefine(checkBranchNotUsedForLocalDirectory);

export const createScheduleBodySchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  cronExpression: z.string().trim().min(1).max(100),
  timezone: z.string().trim().min(1).max(64).default('UTC'),
  description: z.string().max(2000).nullable().optional(),
  dbtCommand: dbtCommandSchema.default('build' satisfies DbtCommand),
  dbtArguments: dbtArgumentsSchema.default([]),
  runDbtDeps: z.boolean().default(true),
  priority: z
    .union([
      z.literal(JOB_PRIORITIES.CRITICAL),
      z.literal(JOB_PRIORITIES.HIGH),
      z.literal(JOB_PRIORITIES.NORMAL),
      z.literal(JOB_PRIORITIES.LOW),
    ])
    .default(JOB_PRIORITIES.NORMAL),
  enabled: z.boolean().default(true),
  concurrencyPolicy: z.enum(CONCURRENCY_POLICIES).default('SKIP_IF_RUNNING'),
  maxRetries: z.number().int().min(0).max(20).default(0),
  retryDelaySeconds: z.number().int().positive().max(86_400).default(60),
  pollForChanges: z.boolean().default(false),
});

export const updateScheduleBodySchema = createScheduleBodySchema
  .omit({ projectId: true })
  .partial();

export const runScheduleBodySchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
  })
  .default({});

export const listJobsQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  scheduleId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  limit: paginationLimitSchema,
});

export const listSchedulesQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
});

export const listLogsQuerySchema = z.object({
  afterSequence: z.coerce.number().int().min(0).default(0),
  limit: paginationLimitSchema,
});

export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>;
export type CreateScheduleBody = z.infer<typeof createScheduleBodySchema>;
export type UpdateScheduleBody = z.infer<typeof updateScheduleBodySchema>;
export type RunScheduleBody = z.infer<typeof runScheduleBodySchema>;
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
