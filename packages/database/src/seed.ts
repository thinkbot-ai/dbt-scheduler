import { JOB_PRIORITIES } from '@dbt-scheduler/types';
import { createPostgresDatabase } from './client.js';
import { ProjectsRepository } from './repositories/projects-repository.js';
import { SchedulesRepository } from './repositories/schedules-repository.js';

export async function seedDevelopmentData(connectionString: string): Promise<void> {
  const database = createPostgresDatabase(connectionString, { max: 1 });
  try {
    const projects = new ProjectsRepository(database.db);
    const existing = await projects.list();
    if (existing.some((project) => project.name === 'example-analytics')) {
      return;
    }

    const project = await projects.create({
      name: 'example-analytics',
      description: 'Example GitHub-hosted dbt project. Replace with a real repository.',
      repositoryUrl: 'https://github.com/example/analytics-dbt.git',
      branch: 'main',
      projectPath: '.',
      environment: 'dev',
      dbtVersion: '1.10.23',
      dbtAdapterVersion: '1.10.1',
      credentialsReference: 'env:DREMIO_PASSWORD',
      enabled: true,
      maxConcurrentJobs: 2,
    });

    const schedules = new SchedulesRepository(database.db);
    await schedules.create({
      projectId: project.id,
      name: 'hourly-build',
      description: 'Hourly dbt build with SKIP_IF_RUNNING',
      cronExpression: '0 * * * *',
      timezone: 'America/New_York',
      dbtCommand: 'build',
      dbtArguments: [],
      priority: JOB_PRIORITIES.NORMAL,
      concurrencyPolicy: 'SKIP_IF_RUNNING',
      enabled: false,
      nextRunAt: null,
    });
  } finally {
    await database.close();
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error('DATABASE_URL is required to seed data');
  }
  await seedDevelopmentData(connectionString);
}

const isCli = process.argv[1] !== undefined && String(process.argv[1]).includes('seed');
if (isCli) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Seed failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
