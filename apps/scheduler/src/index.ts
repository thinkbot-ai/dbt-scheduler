import { loadConfig, publicConfig } from '@dbt-scheduler/config';
import { createPostgresDatabase } from '@dbt-scheduler/database';
import { createLogger, shouldUsePrettyLogs } from '@dbt-scheduler/logging';
import { runSchedulerProcess } from './process.js';

async function main(): Promise<void> {
  const config = loadConfig({ ...process.env, PROCESS_ROLE: 'scheduler' });
  const logger = createLogger({
    name: 'scheduler',
    level: config.LOG_LEVEL,
    pretty: shouldUsePrettyLogs(),
    bindings: { role: 'scheduler' },
  });
  logger.info(
    { event: 'process_starting', config: publicConfig(config) },
    'Scheduler process starting',
  );

  const database = createPostgresDatabase(config.DATABASE_URL);
  try {
    await runSchedulerProcess({
      config,
      logger,
      db: database.db,
      close: () => database.close(),
    });
    logger.info({ event: 'process_stopped', role: 'scheduler' }, 'Scheduler stopped');
  } catch (error) {
    await database.close();
    throw error;
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown scheduler startup error';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
