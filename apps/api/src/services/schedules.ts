import {
  ProjectsRepository,
  SchedulesRepository,
  type CreateScheduleInput,
  type Database,
  type Project,
  type Schedule,
  type UpdateScheduleInput,
} from '@dbt-scheduler/database';
import type { EnqueueJobResult, JobQueue } from '@dbt-scheduler/job-queue';
import { assertValidCronExpression, nextOccurrenceAfter } from '@dbt-scheduler/scheduler-core';
import { NotFoundError, ValidationError } from '@dbt-scheduler/types';
import type {
  CreateScheduleBody,
  RunScheduleBody,
  UpdateScheduleBody,
} from '@dbt-scheduler/validation';

export class ScheduleService {
  constructor(
    private readonly db: Database,
    private readonly queue: JobQueue,
  ) {}

  async list(projectId?: string): Promise<Schedule[]> {
    return new SchedulesRepository(this.db).list(projectId);
  }

  async get(id: string): Promise<Schedule> {
    const schedule = await new SchedulesRepository(this.db).getById(id);
    if (!schedule) {
      throw new NotFoundError('Schedule not found', { details: { id } });
    }
    return schedule;
  }

  async create(body: CreateScheduleBody, now = new Date()): Promise<Schedule> {
    const project = await this.requireProject(body.projectId);
    requirePollForChangesAllowed(body.pollForChanges, project);
    const cronExpression = assertValidCronExpression(body.cronExpression);
    const nextRunAt = nextOccurrenceAfter(cronExpression, body.timezone, now);
    return new SchedulesRepository(this.db).create({
      ...toCreateInput(body, cronExpression),
      nextRunAt,
    });
  }

  async update(id: string, body: UpdateScheduleBody, now = new Date()): Promise<Schedule> {
    const current = await this.get(id);
    if (body.pollForChanges === true) {
      const project = await this.requireProject(current.projectId);
      requirePollForChangesAllowed(body.pollForChanges, project);
    }
    const cronExpression =
      body.cronExpression === undefined
        ? current.cronExpression
        : assertValidCronExpression(body.cronExpression);
    const timezone = body.timezone ?? current.timezone;
    const cronChanged = body.cronExpression !== undefined || body.timezone !== undefined;
    const nextRunAt = cronChanged
      ? nextOccurrenceAfter(cronExpression, timezone, now)
      : current.nextRunAt;
    const updated = await new SchedulesRepository(this.db).update(id, {
      ...toUpdateInput(body, cronExpression),
      ...(nextRunAt === undefined ? {} : { nextRunAt }),
    });
    if (!updated) {
      throw new NotFoundError('Schedule not found', { details: { id } });
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    const deleted = await new SchedulesRepository(this.db).delete(id);
    if (!deleted) {
      throw new NotFoundError('Schedule not found', { details: { id } });
    }
  }

  async setEnabled(id: string, enabled: boolean, now = new Date()): Promise<Schedule> {
    const current = await this.get(id);
    const nextRunAt =
      enabled && current.nextRunAt === null
        ? nextOccurrenceAfter(current.cronExpression, current.timezone, now)
        : undefined;
    const updated = await new SchedulesRepository(this.db).update(id, {
      enabled,
      ...(nextRunAt === undefined ? {} : { nextRunAt }),
    });
    if (!updated) {
      throw new NotFoundError('Schedule not found', { details: { id } });
    }
    return updated;
  }

  async run(id: string, body: RunScheduleBody): Promise<EnqueueJobResult> {
    await this.get(id);
    return this.queue.enqueue({
      scheduleId: id,
      triggerType: 'MANUAL',
      ...(body.idempotencyKey === undefined ? {} : { idempotencyKey: body.idempotencyKey }),
    });
  }

  private async requireProject(projectId: string): Promise<Project> {
    const project = await new ProjectsRepository(this.db).getById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found', { details: { id: projectId } });
    }
    return project;
  }
}

function requirePollForChangesAllowed(pollForChanges: boolean | undefined, project: Project): void {
  if (pollForChanges === true && project.sourceMode !== 'git') {
    throw new ValidationError('pollForChanges requires sourceMode "git" on the project', {
      details: { projectId: project.id, sourceMode: project.sourceMode },
    });
  }
}

function toCreateInput(body: CreateScheduleBody, cronExpression: string): CreateScheduleInput {
  return {
    projectId: body.projectId,
    name: body.name,
    cronExpression,
    timezone: body.timezone,
    dbtCommand: body.dbtCommand,
    dbtArguments: body.dbtArguments,
    runDbtDeps: body.runDbtDeps,
    priority: body.priority,
    enabled: body.enabled,
    concurrencyPolicy: body.concurrencyPolicy,
    maxRetries: body.maxRetries,
    retryDelaySeconds: body.retryDelaySeconds,
    pollForChanges: body.pollForChanges,
    ...(body.description === undefined ? {} : { description: body.description }),
  };
}

function toUpdateInput(body: UpdateScheduleBody, cronExpression: string): UpdateScheduleInput {
  return {
    ...(body.name === undefined ? {} : { name: body.name }),
    ...(body.cronExpression === undefined ? {} : { cronExpression }),
    ...(body.timezone === undefined ? {} : { timezone: body.timezone }),
    ...(body.dbtCommand === undefined ? {} : { dbtCommand: body.dbtCommand }),
    ...(body.dbtArguments === undefined ? {} : { dbtArguments: body.dbtArguments }),
    ...(body.runDbtDeps === undefined ? {} : { runDbtDeps: body.runDbtDeps }),
    ...(body.priority === undefined ? {} : { priority: body.priority }),
    ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
    ...(body.concurrencyPolicy === undefined ? {} : { concurrencyPolicy: body.concurrencyPolicy }),
    ...(body.maxRetries === undefined ? {} : { maxRetries: body.maxRetries }),
    ...(body.retryDelaySeconds === undefined ? {} : { retryDelaySeconds: body.retryDelaySeconds }),
    ...(body.pollForChanges === undefined ? {} : { pollForChanges: body.pollForChanges }),
    ...(body.description === undefined ? {} : { description: body.description }),
  };
}
