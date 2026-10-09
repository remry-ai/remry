// Sample integration test. Runs against a real SQLite database (see setup.ts).

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { getStatus } from '../../src/api/health/operations';
import { TEST_NOTEBOOK } from './test-notebooks';

describe('health integration', () => {
  it('reports database up against a real DB', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const status = await getStatus(reg);
    expect(status.ok).toBe(true);
    expect(status.database).toBe('up');
  });
});
