import { DatabaseError } from '@dbt-scheduler/types';
import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { wrapDatabaseError } from '../errors.js';
import { scheduleExecutionKeys } from '../schema/schedule-execution-keys.js';

export type ScheduleExecutionKey = typeof scheduleExecutionKeys.$inferSelect;

export interface CreateScheduleExecutionKeyInput {
  scheduleId: string;
  scheduledFor: Date;
  jobRunId: string;
}

export class ScheduleExecutionKeysRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: CreateScheduleExecutionKeyInput): Promise<ScheduleExecutionKey> {
    try {
      const [row] = await this.db.insert(scheduleExecutionKeys).values(input).returning();
      if (!row) {
        throw new DatabaseError('Schedule execution key insert returned no row');
      }
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to create schedule execution key');
    }
  }

  async getByScheduleAndTime(
    scheduleId: string,
    scheduledFor: Date,
  ): Promise<ScheduleExecutionKey | undefined> {
    try {
      const [row] = await this.db
        .select()
        .from(scheduleExecutionKeys)
        .where(
          and(
            eq(scheduleExecutionKeys.scheduleId, scheduleId),
            eq(scheduleExecutionKeys.scheduledFor, scheduledFor),
          ),
        )
        .limit(1);
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to load schedule execution key');
    }
  }
}
