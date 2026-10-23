import type { AppConfig } from '@dbt-scheduler/config';
import {
  JobLogsRepository,
  JobRunsRepository,
  ProjectsRepository,
  SchedulesRepository,
  type Database,
  type JobRun,
} from '@dbt-scheduler/database';
import {
  runDbt as defaultRunDbt,
  type DbtExecutionResult,
  type DbtLogLine,
} from '@dbt-scheduler/dbt-runner';
import {
  assertPathInsideRoot,
  prepareJobRepository as defaultPrepareJobRepository,
} from '@dbt-scheduler/git-manager';
import type { Logger } from '@dbt-scheduler/logging';
import { GitError, type FailureClass, type JobRunMetrics } from '@dbt-scheduler/types';
import { stat } from 'node:fs/promises';
import path from 'node:path';

export interface ExecuteJobHandlers {
  prepareRepository?: typeof defaultPrepareJobRepository;
  runDbt?: typeof defaultRunDbt;
}

export interface ExecuteJobInput extends ExecuteJobHandlers {
  job: JobRun;
  db: Database;
  config: Pick<AppConfig, 'WORKSPACE_ROOT' | 'GIT_TOKEN' | 'DBT_BIN'>;
  logger: Logger;
  signal: AbortSignal;
}

export interface ExecuteJobResult {
  outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  commitSha?: string | null;
  repositoryUrl?: string | null;
  branch?: string | null;
  exitCode?: number | null;
  errorMessage?: string;
  failureClass?: FailureClass;
  durationMs: number;
  metrics?: JobRunMetrics | null;
}

export async function executeClaimedJob(input: ExecuteJobInput): Promise<ExecuteJobResult> {
  const started = Date.now();
  const logs = new JobLogsRepository(input.db);
  const buffer = new LogBuffer(logs, input.job.id);

  const fail = (
    failureClass: FailureClass,
    errorMessage: string,
    extra?: Partial<ExecuteJobResult>,
  ): ExecuteJobResult => ({
    outcome: 'FAILED',
    failureClass,
    errorMessage,
    durationMs: Date.now() - started,
    ...extra,
  });

  try {
    if (input.signal.aborted) {
      return cancelled(started);
    }

    const project = await new ProjectsRepository(input.db).getById(input.job.projectId);
    if (!project) {
      await buffer.push('system', 'Project not found');
      await buffer.flushRemaining();
      return fail('CONFIGURATION_FAILURE', 'Project not found');
    }
    const schedule = await new SchedulesRepository(input.db).getById(input.job.scheduleId);
    if (!schedule) {
      await buffer.push('system', 'Schedule not found');
      await buffer.flushRemaining();
      return fail('CONFIGURATION_FAILURE', 'Schedule not found');
    }

    let cwd: string;
    let gitMeta: {
      commitSha: string | null;
      repositoryUrl: string | null;
      branch: string | null;
    };

    if (project.sourceMode === 'local_directory') {
      await buffer.push('system', `Running in place at ${project.repositoryUrl}`);
      let isDirectory = false;
      try {
        isDirectory = (await stat(project.repositoryUrl)).isDirectory();
      } catch {
        isDirectory = false;
      }
      if (!isDirectory) {
        await buffer.flushRemaining();
        return fail('CONFIGURATION_FAILURE', `Local directory not found: ${project.repositoryUrl}`);
      }

      await new JobRunsRepository(input.db).update(input.job.id, {
        commitSha: null,
        repositoryUrl: project.repositoryUrl,
        branch: null,
      });

      cwd = assertPathInsideRoot(
        project.repositoryUrl,
        path.join(project.repositoryUrl, project.projectPath),
      );
      gitMeta = { commitSha: null, repositoryUrl: project.repositoryUrl, branch: null };
    } else {
      await buffer.push('system', `Preparing git workspace for ${project.repositoryUrl}`);
      const prepareRepository = input.prepareRepository ?? defaultPrepareJobRepository;
      const prepared = await prepareRepository({
        workspaceRoot: input.config.WORKSPACE_ROOT,
        jobRunId: input.job.id,
        repositoryUrl: project.repositoryUrl,
        branch: project.branch,
        ...(input.config.GIT_TOKEN === undefined ? {} : { token: input.config.GIT_TOKEN }),
        signal: input.signal,
      });

      await new JobRunsRepository(input.db).update(input.job.id, {
        commitSha: prepared.commitSha,
        repositoryUrl: prepared.repositoryUrl,
        branch: prepared.branch,
      });

      cwd = assertPathInsideRoot(
        prepared.workspacePath,
        path.join(prepared.workspacePath, project.projectPath),
      );
      gitMeta = {
        commitSha: prepared.commitSha,
        repositoryUrl: prepared.repositoryUrl,
        branch: prepared.branch,
      };
    }
    const runDbt = input.runDbt ?? defaultRunDbt;

    if (schedule.runDbtDeps) {
      await buffer.push('system', 'Running dbt deps');
      const deps = await runDbtCommand({
        runDbt,
        config: input.config,
        cwd,
        command: 'deps',
        args: [],
        signal: input.signal,
        onLog: (line) => {
          buffer.enqueue(line.stream, line.message, line.timestamp);
        },
      });
      if (deps.cancelled || input.signal.aborted) {
        await buffer.flushRemaining();
        return cancelled(started, gitMeta);
      }
      if (!deps.succeeded) {
        await buffer.flushRemaining();
        return dbtFailure(deps, started, gitMeta);
      }
    }

    await buffer.push('system', `Running dbt ${input.job.dbtCommand}`);
    const result = await runDbtCommand({
      runDbt,
      config: input.config,
      cwd,
      command: input.job.dbtCommand,
      args: input.job.dbtArguments,
      signal: input.signal,
      onLog: (line) => {
        buffer.enqueue(line.stream, line.message, line.timestamp);
      },
    });
    await buffer.flushRemaining();

    if (result.cancelled || input.signal.aborted) {
      return cancelled(started, gitMeta);
    }
    if (!result.succeeded) {
      return dbtFailure(result, started, gitMeta);
    }

    return {
      outcome: 'SUCCESS',
      ...gitMeta,
      exitCode: result.exitCode ?? 0,
      durationMs: Date.now() - started,
      ...(result.metrics === undefined ? {} : { metrics: result.metrics }),
    };
  } catch (error) {
    await buffer.flushRemaining();
    if (input.signal.aborted) {
      return cancelled(started);
    }
    if (error instanceof GitError) {
      const failureClass: FailureClass = /invalid|unsafe|escapes|must contain/i.test(error.message)
        ? 'CONFIGURATION_FAILURE'
        : 'WORKER_FAILURE';
      input.logger.warn(
        { event: 'job_git_failed', job_id: input.job.id, failure_class: failureClass },
        'Git preparation failed',
      );
      return fail(failureClass, error.message);
    }
    const message = error instanceof Error ? error.message : 'Unknown worker execution error';
    input.logger.error({ event: 'job_execute_failed', job_id: input.job.id }, message);
    return fail('WORKER_FAILURE', message);
  }
}

function cancelled(started: number, gitMeta?: Partial<ExecuteJobResult>): ExecuteJobResult {
  return {
    outcome: 'CANCELLED',
    failureClass: 'CANCELLED',
    errorMessage: 'Job cancelled',
    durationMs: Date.now() - started,
    ...gitMeta,
  };
}

function dbtFailure(
  result: DbtExecutionResult,
  started: number,
  gitMeta: Partial<ExecuteJobResult>,
): ExecuteJobResult {
  return {
    outcome: 'FAILED',
    ...gitMeta,
    exitCode: result.exitCode,
    errorMessage: result.errorMessage ?? `dbt exited with code ${result.exitCode ?? 'unknown'}`,
    failureClass: result.failureClass ?? 'DBT_FAILURE',
    durationMs: Date.now() - started,
    ...(result.metrics === undefined ? {} : { metrics: result.metrics }),
  };
}

async function runDbtCommand(input: {
  runDbt: typeof defaultRunDbt;
  config: Pick<AppConfig, 'DBT_BIN'>;
  cwd: string;
  command: string;
  args: readonly string[];
  signal: AbortSignal;
  onLog: (line: DbtLogLine) => void;
}): Promise<DbtExecutionResult> {
  return input.runDbt({
    bin: input.config.DBT_BIN,
    command: input.command,
    args: input.args,
    cwd: input.cwd,
    signal: input.signal,
    onLog: input.onLog,
  });
}

class LogBuffer {
  private pending: {
    stream: DbtLogLine['stream'] | 'system';
    message: string;
    timestamp?: Date;
  }[] = [];
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly logs: JobLogsRepository,
    private readonly jobRunId: string,
    private readonly flushSize = 20,
  ) {}

  enqueue(stream: DbtLogLine['stream'] | 'system', message: string, timestamp?: Date): void {
    this.pending.push({
      stream,
      message,
      ...(timestamp === undefined ? {} : { timestamp }),
    });
    if (this.pending.length >= this.flushSize) {
      this.writing = this.writing.then(() => this.flush());
    }
  }

  async push(
    stream: DbtLogLine['stream'] | 'system',
    message: string,
    timestamp?: Date,
  ): Promise<void> {
    this.enqueue(stream, message, timestamp);
    await this.flushRemaining();
  }

  async flushRemaining(): Promise<void> {
    await this.writing;
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.pending.length === 0) {
      return;
    }
    const batch = this.pending;
    this.pending = [];
    await this.logs.append(this.jobRunId, batch);
  }
}
