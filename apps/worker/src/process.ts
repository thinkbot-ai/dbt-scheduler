import type { AppConfig, ShutdownWaiter } from '@dbt-scheduler/config';
import { waitForShutdownSignal } from '@dbt-scheduler/config';
import type { Database } from '@dbt-scheduler/database';
import type { Logger } from '@dbt-scheduler/logging';
import { WorkerRuntime, type WorkerRuntimeOptions } from './runtime.js';

export interface RunWorkerProcessOptions extends Omit<
  WorkerRuntimeOptions,
  'hostname' | 'workerName'
> {
  config: AppConfig;
  logger: Logger;
  db: Database;
  hostname: string;
  workerName: string;
  waitForShutdown?: ShutdownWaiter;
  close?: () => Promise<void>;
}

export async function runWorkerProcess(options: RunWorkerProcessOptions): Promise<void> {
  const waitForShutdown = options.waitForShutdown ?? waitForShutdownSignal;
  const runtime = new WorkerRuntime(options);
  const worker = await runtime.start();
  options.logger.info(
    { event: 'process_started', role: 'worker', worker_id: worker.id },
    'Worker started',
  );

  const looping = runtime.loop();
  const signal = await waitForShutdown();
  options.logger.info(
    { event: 'shutdown_requested', signal, role: 'worker', worker_id: worker.id },
    'Worker shutting down',
  );
  await runtime.stop(signal);
  await looping;
  if (options.close) {
    await options.close();
  }
}
