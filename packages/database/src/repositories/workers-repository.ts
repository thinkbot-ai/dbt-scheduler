import type { WorkerStatus } from '@dbt-scheduler/types';
import { DatabaseError } from '@dbt-scheduler/types';
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { wrapDatabaseError } from '../errors.js';
import { workers } from '../schema/workers.js';

export type Worker = typeof workers.$inferSelect;

export interface RegisterWorkerInput {
  workerName: string;
  hostname: string;
  concurrency?: number;
  status?: WorkerStatus;
}

export interface UpdateWorkerInput {
  status?: WorkerStatus;
  currentJobId?: string | null;
  lastHeartbeat?: Date;
  concurrency?: number;
}

export class WorkersRepository {
  constructor(private readonly db: DbOrTx) {}

  async register(input: RegisterWorkerInput): Promise<Worker> {
    try {
      const [row] = await this.db
        .insert(workers)
        .values({
          workerName: input.workerName,
          hostname: input.hostname,
          concurrency: input.concurrency,
          status: input.status ?? 'STARTING',
          lastHeartbeat: new Date(),
          startedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: workers.workerName,
          set: {
            hostname: input.hostname,
            concurrency: input.concurrency,
            status: input.status ?? 'STARTING',
            currentJobId: null,
            lastHeartbeat: new Date(),
            startedAt: new Date(),
          },
        })
        .returning();
      if (!row) {
        throw new DatabaseError('Worker register returned no row');
      }
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to register worker');
    }
  }

  async getById(id: string): Promise<Worker | undefined> {
    try {
      const [row] = await this.db.select().from(workers).where(eq(workers.id, id)).limit(1);
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to load worker');
    }
  }

  async list(): Promise<Worker[]> {
    try {
      return await this.db.select().from(workers);
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to list workers');
    }
  }

  async heartbeat(id: string, currentJobId?: string | null): Promise<Worker | undefined> {
    try {
      const [row] = await this.db
        .update(workers)
        .set({
          lastHeartbeat: new Date(),
          ...(currentJobId === undefined ? {} : { currentJobId }),
        })
        .where(eq(workers.id, id))
        .returning();
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to update worker heartbeat');
    }
  }

  async update(id: string, input: UpdateWorkerInput): Promise<Worker | undefined> {
    try {
      const [row] = await this.db.update(workers).set(input).where(eq(workers.id, id)).returning();
      return row;
    } catch (error) {
      throw wrapDatabaseError(error, 'Failed to update worker');
    }
  }
}
