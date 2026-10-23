import type { LogStream } from '@dbt-scheduler/types';
import { and, eq, gt } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { wrapDatabaseError } from '../errors.js';
import { jobLogs } from '../schema/job-logs.js';

export const MAX_JOB_LOG_MESSAGE_CHARS = 8_192;
export const MAX_JOB_LOG_ROWS_PER_RUN = 20_000;

export type JobLog = typeof jobLogs.$inferSelect;

export interface AppendJobLogInput {
  stream: LogStream;
  message: string;
  timestamp?: Date;
}

export interface AppendJobLogsResult {
  inserted: JobLog[];
  truncated: boolean;
}

function truncateMessage(message: string): string {
  if (message.length <= MAX_JOB_LOG_MESSAGE_CHARS) {
    return message;
  }
  const suffix = '\n[truncated]';
  return `${message.slice(0, MAX_JOB_LOG_MESSAGE_CHARS - suffix.length)}${suffix}`;
}

export class JobLogsRepository {
  constructor(private readonly db: DbOrTx) {}

  async append(
    jobRunId: string,
    entries: readonly AppendJobLogInput[],
  ): Promise<AppendJobLogsResult> {
    try {
      const existing = await this.db
        .select({
          sequenceNumber: jobLogs.sequenceNumber,
          stream: jobLogs.stream,
          message: jobLogs.message,
        })
        .from(jobLogs)
        .where(eq(jobLogs.jobRunId, jobRunId));

      const nextSequence = existing.reduce((max, row) => Math.max(max, row.sequenceNumber), 0) + 1;
      const alreadyTruncated = existing.some(
        (row) => row.stream === 'system' && row.message.includes('log truncated'),
      );

      if (existing.length >= MAX_JOB_LOG_ROWS_PER_RUN || alreadyTruncated) {
        if (alreadyTruncated) {
          return { inserted: [], truncated: true };
        }
        const [row] = await this.db
          .insert(jobLogs)
          .values({
            jobRunId,
            stream: 'system',
            message: `log truncated after ${MAX_JOB_LOG_ROWS_PER_RUN} rows; later lines can move to object storage`,
            sequenceNumber: nextSequence,
          })
          .returning();
        return { inserted: row ? [row] : [], truncated: true };
      }

      const remaining = MAX_JOB_LOG_ROWS_PER_RUN - existing.length;
      const accepted = entries.slice(0, remaining);
      const overflowed = entries.length > remaining;
      const values = accepted.map((entry, index) => ({
        jobRunId,
        stream: entry.stream,
        message: truncateMessage(entry.message),
        timestamp: entry.timestamp,
        sequenceNumber: nextSequence + index,
      }));

      const inserted =
        values.length === 0 ? [] : await this.db.insert(jobLogs).values(values).returning();

      if (overflowed && inserted.length > 0) {
        const [truncationRow] = await this.db
          .insert(jobLogs)
          .values({
            jobRunId,
            stream: 'system',
            message: `log truncated after ${MAX_JOB_LOG_ROWS_PER_RUN} rows; later lines can move to object storage`,
            sequenceNumber: nextSequence + inserted.length,
          })
          .returning();
        if (truncationRow) {
          inserted.push(truncationRow);
        }
      }

      return { inserted, truncated: overflowed };
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to append job logs');
    }
  }

  async listByJobRun(
    jobRunId: string,
    options?: { afterSequence?: number; limit?: number },
  ): Promise<JobLog[]> {
    try {
      const afterSequence = options?.afterSequence ?? 0;
      const limit = options?.limit ?? 1_000;
      return await this.db
        .select()
        .from(jobLogs)
        .where(and(eq(jobLogs.jobRunId, jobRunId), gt(jobLogs.sequenceNumber, afterSequence)))
        .orderBy(jobLogs.sequenceNumber)
        .limit(limit);
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to list job logs');
    }
  }
}
