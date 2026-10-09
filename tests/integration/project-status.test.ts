// Project status is one of six: writes map common words onto them and refuse
// anything else, and the project_statuses migration maps data stored before.

import { describe, it, expect } from 'vitest';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import type { Logger } from '../../src/shared/types/logger';
import { applyMigrations } from '../../src/shared/db/migrate.server';
import { getRegistry } from '../../src/shared/registry.server';
import { createProject, getProject, updateProject } from '../../src/api/project/operations';
import { TEST_NOTEBOOK } from './test-notebooks';

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as Logger;
const MIGRATION = '20261008120000_project_statuses';

describe('project status', () => {
  it('stores a synonym as its status and refuses anything else', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const created = await createProject(reg, { name: 'Status words', status: 'Active' });
    if (!created.ok) throw created.error;
    const read = await getProject(reg, created.value.id);
    expect(read.ok && read.value.status).toBe('in-progress');

    const bad = await updateProject(reg, created.value.id, { status: 'vibes' });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error.message).toContain('Use one of: proposed, committed, in-progress, blocked, done, abandoned');

    expect((await updateProject(reg, created.value.id, { status: 'proposed' })).ok).toBe(true);
    expect((await updateProject(reg, created.value.id, { status: null })).ok).toBe(true);
    const cleared = await getProject(reg, created.value.id);
    expect(cleared.ok && cleared.value.status).toBeNull();
  });

  it('migrates statuses stored as free text', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'remry-status-'));
    try {
      // Every migration before this one, then the old data, then this one.
      const migrations = join(dir, 'migrations');
      cpSync('prisma/migrations', migrations, { recursive: true, filter: (src) => !src.includes(MIGRATION) });
      const client = createClient({ url: `file:${join(dir, 'db.sqlite')}` });
      await applyMigrations(client, migrations, quiet);

      const old: readonly [string, string | null][] = [
        ['a', 'active'], ['b', 'In Progress'], ['c', 'planning'], ['d', 'On hold'],
        ['e', 'done'], ['f', 'archived'], ['g', 'idea'], ['h', 'vibes'], ['i', null]
      ];
      for (const [id, status] of old) {
        await client.execute({
          sql: 'INSERT INTO "project" (id, name, status, created_at, updated_at) VALUES (?, ?, ?, 0, 0)',
          args: [id, id, status]
        });
      }

      cpSync(join('prisma/migrations', MIGRATION), join(migrations, MIGRATION), { recursive: true });
      await applyMigrations(client, migrations, quiet);

      const rows = await client.execute('SELECT id, status FROM "project" ORDER BY id');
      expect(rows.rows.map((r) => [r.id, r.status])).toEqual([
        ['a', 'in-progress'], ['b', 'in-progress'], ['c', 'committed'], ['d', 'blocked'],
        ['e', 'done'], ['f', 'abandoned'], ['g', 'proposed'], ['h', null], ['i', null]
      ]);
      client.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
