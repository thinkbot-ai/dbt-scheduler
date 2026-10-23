import type { ConcurrencyPolicy, DbtCommand } from '@dbt-scheduler/types';
import { DatabaseError } from '@dbt-scheduler/types';
import { and, eq, isNull, lte } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { wrapDatabaseError } from '../errors.js';
import { schedules } from '../schema/schedules.js';

export type Schedule = typeof schedules.$inferSelect;

export interface CreateScheduleInput {
  projectId: string;
  name: string;
  cronExpression: string;
  description?: string | null;
  timezone?: string;
  dbtCommand?: DbtCommand;
  dbtArguments?: string[];
  runDbtDeps?: boolean;
  priority?: number;
  enabled?: boolean;
  concurrencyPolicy?: ConcurrencyPolicy;
  maxRetries?: number;
  retryDelaySeconds?: number;
  pollForChanges?: boolean;
  lastSeenCommitSha?: string | null;
  nextRunAt?: Date | null;
  lastRunAt?: Date | null;
}

export interface UpdateScheduleInput {
  name?: string;
  description?: string | null;
  cronExpression?: string;
  timezone?: string;
  dbtCommand?: DbtCommand;
  dbtArguments?: string[];
  runDbtDeps?: boolean;
  priority?: number;
  enabled?: boolean;
  concurrencyPolicy?: ConcurrencyPolicy;
  maxRetries?: number;
  retryDelaySeconds?: number;
  pollForChanges?: boolean;
  lastSeenCommitSha?: string | null;
  nextRunAt?: Date | null;
  lastRunAt?: Date | null;
}

export class SchedulesRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: CreateScheduleInput): Promise<Schedule> {
    try {
      const [row] = await this.db.insert(schedules).values(input).returning();
      if (!row) {
        throw new DatabaseError('Schedule insert returned no row');
      }
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to create schedule');
    }
  }

  async getById(id: string): Promise<Schedule | undefined> {
    try {
      const [row] = await this.db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to load schedule');
    }
  }

  async listByProject(projectId: string): Promise<Schedule[]> {
    try {
      return await this.db.select().from(schedules).where(eq(schedules.projectId, projectId));
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to list schedules');
    }
  }

  async list(projectId?: string): Promise<Schedule[]> {
    try {
      if (projectId === undefined) {
        return await this.db.select().from(schedules).orderBy(schedules.name);
      }
      return await this.db
        .select()
        .from(schedules)
        .where(eq(schedules.projectId, projectId))
        .orderBy(schedules.name);
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to list schedules');
    }
  }

  async lockById(id: string): Promise<Schedule | undefined> {
    try {
      const [row] = await this.db
        .select()
        .from(schedules)
        .where(eq(schedules.id, id))
        .limit(1)
        .for('update');
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to lock schedule');
    }
  }

  async listEnabledWithoutNextRun(): Promise<Schedule[]> {
    try {
      return await this.db
        .select()
        .from(schedules)
        .where(and(eq(schedules.enabled, true), isNull(schedules.nextRunAt)));
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to list schedules missing next_run_at');
    }
  }

  async listEnabledDue(now: Date): Promise<Schedule[]> {
    try {
      return await this.db
        .select()
        .from(schedules)
        .where(and(eq(schedules.enabled, true), lte(schedules.nextRunAt, now)))
        .orderBy(schedules.nextRunAt);
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to list due schedules');
    }
  }

  async update(id: string, input: UpdateScheduleInput): Promise<Schedule | undefined> {
    try {
      const [row] = await this.db
        .update(schedules)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(schedules.id, id))
        .returning();
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to update schedule');
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const deleted = await this.db.delete(schedules).where(eq(schedules.id, id)).returning();
      return deleted.length > 0;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to delete schedule');
    }
  }
}
