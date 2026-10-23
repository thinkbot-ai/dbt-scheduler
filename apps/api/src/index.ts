import { loadConfig, publicConfig, waitForShutdownSignal } from '@dbt-scheduler/config';
import { createPostgresDatabase } from '@dbt-scheduler/database';
import { createLogger, shouldUsePrettyLogs } from '@dbt-scheduler/logging';
import { buildApi } from './app.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({
    name: 'api',
    level: config.LOG_LEVEL,
    pretty: shouldUsePrettyLogs(),
    bindings: {
      worker_id: undefined,
      role: config.PROCESS_ROLE,
    },
  });

  logger.info({ event: 'process_starting', config: publicConfig(config) }, 'API process starting');

  const database = createPostgresDatabase(config.DATABASE_URL);
  try {
    await database.ping();
    const app = await buildApi({ config, logger, db: database.db });

    await app.listen({ host: config.API_BIND_HOST, port: config.PORT });
    logger.info(
      { event: 'api_listening', port: config.PORT, host: config.API_BIND_HOST },
      'API listening',
    );

    const signal = await waitForShutdownSignal();
    logger.info({ event: 'shutdown_requested', signal }, 'API shutting down');
    await app.close();
    logger.info({ event: 'process_stopped' }, 'API stopped');
  } finally {
    await database.close();
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown API startup error';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
