import type { JobRunMetrics } from '@dbt-scheduler/types';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const DEFAULT_TARGET_PATH = 'target';

const runResultSchema = z
  .object({
    unique_id: z.string().optional(),
    status: z.string().optional(),
    execution_time: z.number().optional(),
    message: z.string().nullish(),
  })
  .passthrough();

const runResultsSchema = z
  .object({
    metadata: z
      .object({
        dbt_version: z.string().optional(),
        generated_at: z.string().optional(),
        invocation_id: z.string().optional(),
      })
      .passthrough()
      .optional(),
    results: z.array(runResultSchema).default([]),
    elapsed_time: z.number().optional(),
  })
  .passthrough();

export type RunResults = z.infer<typeof runResultsSchema>;

export interface DbtArtifacts {
  runResultsFound: boolean;
  manifestFound: boolean;
  catalogFound: boolean;
  dbtVersion?: string;
  invocationId?: string;
  metrics?: JobRunMetrics;
  /** Set when an artifact existed but could not be parsed. */
  parseError?: string;
}

const TEST_NODE_PREFIXES = ['test', 'unit_test'];

/** A `warn` test missed its expectation but does not fail the dbt run. */
const PASSING_TEST_STATUSES = ['pass', 'warn'];
const FAILING_TEST_STATUSES = ['fail', 'error', 'runtime error'];
const SUCCESSFUL_NODE_STATUSES = ['success', 'pass'];
const FAILED_NODE_STATUSES = ['error', 'fail', 'runtime error'];

function nodeKind(uniqueId: string | undefined): string {
  if (uniqueId === undefined) {
    return 'unknown';
  }
  const [prefix] = uniqueId.split('.');
  return prefix ?? 'unknown';
}

export function summarizeRunResults(runResults: RunResults): JobRunMetrics {
  const metrics: JobRunMetrics = {
    modelsAttempted: 0,
    modelsSuccessful: 0,
    modelsFailed: 0,
    modelsSkipped: 0,
    testsPassed: 0,
    testsFailed: 0,
  };

  for (const result of runResults.results) {
    const status = (result.status ?? '').toLowerCase();
    const isTest = TEST_NODE_PREFIXES.includes(nodeKind(result.unique_id));

    if (isTest) {
      if (PASSING_TEST_STATUSES.includes(status)) {
        metrics.testsPassed += 1;
      } else if (FAILING_TEST_STATUSES.includes(status)) {
        metrics.testsFailed += 1;
      }
      continue;
    }

    if (SUCCESSFUL_NODE_STATUSES.includes(status)) {
      metrics.modelsAttempted += 1;
      metrics.modelsSuccessful += 1;
    } else if (FAILED_NODE_STATUSES.includes(status)) {
      metrics.modelsAttempted += 1;
      metrics.modelsFailed += 1;
    } else if (status === 'skipped') {
      metrics.modelsAttempted += 1;
      metrics.modelsSkipped += 1;
    }
  }

  if (runResults.elapsed_time !== undefined) {
    metrics.executionDurationMs = Math.round(runResults.elapsed_time * 1000);
  }

  return metrics;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Reads dbt artifacts from `<cwd>/<targetPath>`. Not every dbt command writes
 * every artifact, so missing files are reported rather than treated as errors.
 */
export async function readDbtArtifacts(
  cwd: string,
  targetPath: string = DEFAULT_TARGET_PATH,
): Promise<DbtArtifacts> {
  const targetDir = path.resolve(cwd, targetPath);
  const artifacts: DbtArtifacts = {
    runResultsFound: false,
    manifestFound: false,
    catalogFound: false,
  };

  try {
    const raw = await readFile(path.join(targetDir, 'run_results.json'), 'utf8');
    artifacts.runResultsFound = true;
    const parsed = runResultsSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      artifacts.metrics = summarizeRunResults(parsed.data);
      if (parsed.data.metadata?.dbt_version !== undefined) {
        artifacts.dbtVersion = parsed.data.metadata.dbt_version;
      }
      if (parsed.data.metadata?.invocation_id !== undefined) {
        artifacts.invocationId = parsed.data.metadata.invocation_id;
      }
    } else {
      artifacts.parseError = 'run_results.json did not match the expected shape';
    }
  } catch (error) {
    if (isJsonSyntaxError(error)) {
      artifacts.runResultsFound = true;
      artifacts.parseError = 'run_results.json is not valid JSON';
    }
  }

  artifacts.manifestFound = await fileExists(path.join(targetDir, 'manifest.json'));
  artifacts.catalogFound = await fileExists(path.join(targetDir, 'catalog.json'));

  return artifacts;
}

function isJsonSyntaxError(error: unknown): boolean {
  return error instanceof SyntaxError;
}
