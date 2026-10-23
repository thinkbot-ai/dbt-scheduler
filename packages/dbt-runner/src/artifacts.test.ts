import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readDbtArtifacts, summarizeRunResults } from './artifacts.js';

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'dbt-artifacts-'));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

async function writeTargetFile(name: string, contents: string): Promise<void> {
  const targetDir = path.join(workspace, 'target');
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, name), contents);
}

describe('summarizeRunResults', () => {
  it('separates model outcomes from test outcomes', () => {
    const metrics = summarizeRunResults({
      elapsed_time: 4.2,
      results: [
        { unique_id: 'model.a.one', status: 'success' },
        { unique_id: 'model.a.two', status: 'error' },
        { unique_id: 'model.a.three', status: 'skipped' },
        { unique_id: 'seed.a.raw', status: 'success' },
        { unique_id: 'snapshot.a.snap', status: 'success' },
        { unique_id: 'test.a.not_null', status: 'pass' },
        { unique_id: 'test.a.unique', status: 'fail' },
        { unique_id: 'test.a.range', status: 'warn' },
        { unique_id: 'test.a.broken', status: 'error' },
      ],
    });

    expect(metrics).toEqual({
      modelsAttempted: 5,
      modelsSuccessful: 3,
      modelsFailed: 1,
      modelsSkipped: 1,
      testsPassed: 2,
      testsFailed: 2,
      executionDurationMs: 4_200,
    });
  });

  it('returns zeroed metrics for an empty run', () => {
    expect(summarizeRunResults({ results: [] })).toEqual({
      modelsAttempted: 0,
      modelsSuccessful: 0,
      modelsFailed: 0,
      modelsSkipped: 0,
      testsPassed: 0,
      testsFailed: 0,
    });
  });
});

describe('readDbtArtifacts', () => {
  it('reports every artifact as missing when dbt wrote nothing', async () => {
    const artifacts = await readDbtArtifacts(workspace);

    expect(artifacts).toEqual({
      runResultsFound: false,
      manifestFound: false,
      catalogFound: false,
    });
  });

  it('reads metrics and metadata from run_results.json', async () => {
    await writeTargetFile(
      'run_results.json',
      JSON.stringify({
        metadata: { dbt_version: '1.10.23', invocation_id: 'abc-123' },
        elapsed_time: 2,
        results: [{ unique_id: 'model.a.one', status: 'success' }],
      }),
    );

    const artifacts = await readDbtArtifacts(workspace);

    expect(artifacts.runResultsFound).toBe(true);
    expect(artifacts.dbtVersion).toBe('1.10.23');
    expect(artifacts.invocationId).toBe('abc-123');
    expect(artifacts.metrics?.modelsSuccessful).toBe(1);
    expect(artifacts.metrics?.executionDurationMs).toBe(2_000);
  });

  it('detects manifest and catalog independently', async () => {
    await writeTargetFile('manifest.json', '{}');
    await writeTargetFile('catalog.json', '{}');

    const artifacts = await readDbtArtifacts(workspace);

    expect(artifacts.manifestFound).toBe(true);
    expect(artifacts.catalogFound).toBe(true);
    expect(artifacts.runResultsFound).toBe(false);
  });

  it('records a parse error instead of throwing on corrupt JSON', async () => {
    await writeTargetFile('run_results.json', '{ broken');

    const artifacts = await readDbtArtifacts(workspace);

    expect(artifacts.runResultsFound).toBe(true);
    expect(artifacts.parseError).toBe('run_results.json is not valid JSON');
    expect(artifacts.metrics).toBeUndefined();
  });

  it('honors a custom target path', async () => {
    const customDir = path.join(workspace, 'custom-target');
    await mkdir(customDir, { recursive: true });
    await writeFile(
      path.join(customDir, 'run_results.json'),
      JSON.stringify({ results: [{ unique_id: 'model.a.one', status: 'success' }] }),
    );

    const artifacts = await readDbtArtifacts(workspace, 'custom-target');

    expect(artifacts.runResultsFound).toBe(true);
    expect(artifacts.metrics?.modelsSuccessful).toBe(1);
  });
});
