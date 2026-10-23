import { buildDbtArgv } from '@dbt-scheduler/validation';

export const DEFAULT_DBT_TIMEOUT_MS = 3_600_000;

export interface DbtSpawnPlan {
  bin: string;
  argv: string[];
  cwd: string;
  timeoutMs: number;
}

export interface CreateDbtSpawnPlanInput {
  bin: string;
  command: string;
  args?: readonly string[];
  cwd: string;
  timeoutMs?: number;
}

export function createDbtSpawnPlan(input: CreateDbtSpawnPlanInput): DbtSpawnPlan {
  return {
    bin: input.bin,
    argv: buildDbtArgv(input.command, input.args ?? []),
    cwd: input.cwd,
    timeoutMs: input.timeoutMs ?? DEFAULT_DBT_TIMEOUT_MS,
  };
}
