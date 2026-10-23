import { describe, expect, it } from 'vitest';
import { createDbtSpawnPlan } from './spawn-plan.js';

describe('createDbtSpawnPlan', () => {
  it('never interpolates a shell string', () => {
    const plan = createDbtSpawnPlan({
      bin: 'dbt',
      command: 'build',
      args: ['--select', 'marts+'],
      cwd: '/workspaces/job-1',
    });

    expect(plan.bin).toBe('dbt');
    expect(plan.argv).toEqual(['build', '--select', 'marts+']);
    expect(plan.cwd).toBe('/workspaces/job-1');
  });
});
