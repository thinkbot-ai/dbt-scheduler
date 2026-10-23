import type { AppConfig, ShutdownWaiter } from '@dbt-scheduler/config';
import { waitForShutdownSignal } from '@dbt-scheduler/config';
import type { Database } from '@dbt-scheduler/database';
import type { Logger } from '@dbt-scheduler/logging';
import { SchedulerRuntime, type SchedulerRuntimeOptions } from './runtime.js';

export interface RunSchedulerProcessOptions extends SchedulerRuntimeOptions {
  config: AppConfig;
  logger: Logger;
  db: Database;
  waitForShutdown?: ShutdownWaiter;
  close?: () => Promise<void>;
}

export async function runSchedulerProcess(options: RunSchedulerProcessOptions): Promise<void> {
  const waitForShutdown = options.waitForShutdown ?? waitForShutdownSignal;
  const runtime = new SchedulerRuntime(options);
  options.logger.info({ event: 'process_started', role: 'scheduler' }, 'Scheduler started');

  const looping = runtime.loop();
  const signal = await waitForShutdown();
  options.logger.info(
    { event: 'shutdown_requested', signal, role: 'scheduler' },
    'Scheduler shutting down',
  );
  await runtime.stop(signal);
  await looping;
  if (options.close) {
    await options.close();
  }
}
