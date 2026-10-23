import { loadConfig, publicConfig } from '@dbt-scheduler/config';
import { createPostgresDatabase } from '@dbt-scheduler/database';
import { createLogger, shouldUsePrettyLogs } from '@dbt-scheduler/logging';
import { hostname } from 'node:os';
import { runWorkerProcess } from './process.js';

async function main(): Promise<void> {
  const config = loadConfig({ ...process.env, PROCESS_ROLE: 'worker' });
  const workerName = config.WORKER_ID ?? `worker-${hostname()}-${process.pid}`;
  const logger = createLogger({
    name: 'worker',
    level: config.LOG_LEVEL,
    pretty: shouldUsePrettyLogs(),
    bindings: { role: 'worker', worker_name: workerName },
  });
  logger.info(
    { event: 'process_starting', config: publicConfig(config) },
    'Worker process starting',
  );

  const database = createPostgresDatabase(config.DATABASE_URL);
  try {
    await runWorkerProcess({
      config,
      logger,
      db: database.db,
      hostname: hostname(),
      workerName,
      close: () => database.close(),
    });
    logger.info(
      { event: 'process_stopped', role: 'worker', worker_name: workerName },
      'Worker stopped',
    );
  } catch (error) {
    await database.close();
    throw error;
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown worker startup error';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
