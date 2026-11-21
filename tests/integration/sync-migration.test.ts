// The sync_doc_per_entity migration on a database in the shape before it: each entity keeps its
// newest sync doc, whose sources move to the entity (merged with a link it already has), the other
// sync docs become ordinary docs, and a sync page's links become its sources. Then, against the
// app database, the startup step that moves a moved file link's file into its entity's folder.

import { describe, it, expect } from 'vitest';
import { cpSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import type { Logger } from '../../src/shared/types/logger';
import { applyMigrations } from '../../src/shared/db/migrate.server';
import { getRegistry } from '../../src/shared/registry.server';
import { createProject } from '../../src/api/project/operations';
import { addDoc } from '../../src/api/attached/doc/operations';
import { listLinks, readLinkFile, uploadLinkFile } from '../../src/api/attached/link/operations';
import { adoptStrayFileLinks } from '../../src/api/attached/link/stray-files';
import { TEST_NOTEBOOK } from './test-notebooks';

const MIGRATION = '20261121120000_sync_doc_per_entity';
const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as Logger;
const onDisk = readdirSync('prisma/migrations', { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();

const migrationsUpTo = (last: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'remry-sync-migrations-'));
  for (const name of onDisk.slice(0, onDisk.indexOf(last) + 1)) cpSync(join('prisma/migrations', name), join(dir, name), { recursive: true });
  return dir;
};

const rows = async (client: Client, sql: string): Promise<readonly Record<string, unknown>[]> =>
  (await client.execute(sql)).rows.map((r) => ({ ...r }));

const must = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

describe('the sync_doc_per_entity migration', () => {
  it('keeps each entity\'s newest sync doc, moves its sources to the entity, and makes the rest ordinary docs', async () => {
    const client = createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), 'remry-sync-db-')), 'db.sqlite')}` });
    const before = onDisk[onDisk.indexOf(MIGRATION) - 1]!;
    expect((await applyMigrations(client, migrationsUpTo(before), quiet)).ok).toBe(true);

    const at = (day: number): string => `2026-10-${String(day).padStart(2, '0')}T09:00:00.000+00:00`;
    await client.executeMultiple(`
      INSERT INTO "project" ("id", "name", "created_at", "updated_at") VALUES ('p1', 'Checkout', '${at(1)}', '${at(1)}');
      INSERT INTO "goal" ("id", "title", "created_at", "updated_at") VALUES ('g1', 'Faster', '${at(1)}', '${at(1)}');
      INSERT INTO "page" ("id", "title", "content", "prompt", "created_at", "updated_at") VALUES ('pg1', 'Vendors', '# V', 'Tiers only.', '${at(1)}', '${at(1)}');
      INSERT INTO "page" ("id", "title", "content", "created_at", "updated_at") VALUES ('pg2', 'Plain', '', '${at(1)}', '${at(1)}');
      INSERT INTO "doc" ("id", "entity_type", "entity_id", "title", "content", "prompt", "last_sync_at", "last_sync_outcome", "created_at", "updated_at")
        VALUES ('d_old', 'PROJECT', 'p1', 'Old brief', '# Old', 'Scope.', '${at(2)}', 'OK', '${at(1)}', '${at(2)}'),
               ('d_new', 'PROJECT', 'p1', 'Checkout brief', '# New', 'Scope and dates.', '${at(5)}', 'OK', '${at(1)}', '${at(5)}'),
               ('d_plain', 'PROJECT', 'p1', 'Notes', 'notes', NULL, NULL, NULL, '${at(1)}', '${at(6)}'),
               ('d_goal', 'GOAL', 'g1', 'Faster brief', '# G', 'Dates.', NULL, NULL, '${at(1)}', '${at(1)}');
      INSERT INTO "link" ("id", "entity_type", "entity_id", "url", "title", "synced_at", "created_at") VALUES
        ('l_prd', 'DOC', 'd_new', 'https://notion.so/acme/prd', 'Notion: PRD', '${at(5)}', '${at(1)}'),
        ('l_dupe', 'DOC', 'd_new', 'https://linear.app/acme/checkout', 'Linear', '${at(4)}', '${at(1)}'),
        ('l_file', 'DOC', 'd_new', 'storage://docs/d_new/file-a.pdf', 'Quote.pdf', NULL, '${at(1)}'),
        ('l_project', 'PROJECT', 'p1', 'https://linear.app/acme/checkout', 'Linear: Checkout', '${at(3)}', '${at(1)}'),
        ('l_old', 'DOC', 'd_old', 'https://example.com/old', NULL, NULL, '${at(1)}'),
        ('l_goal', 'DOC', 'd_goal', 'https://example.com/goal', NULL, NULL, '${at(1)}'),
        ('l_page', 'PAGE', 'pg1', 'https://notion.so/acme/pricing', NULL, NULL, '${at(1)}'),
        ('l_plain_page', 'PAGE', 'pg2', 'https://example.com/plain', NULL, NULL, '${at(1)}');
    `);

    expect((await applyMigrations(client, 'prisma/migrations', quiet)).ok).toBe(true);

    const docs = await rows(client, 'SELECT "id", "prompt", "sync_holder", "last_sync_at" FROM "doc" ORDER BY "id"');
    expect(docs).toEqual([
      { id: 'd_goal', prompt: 'Dates.', sync_holder: 'GOAL:g1', last_sync_at: null },
      // The newest keeps its prompt and last sync; the older one is an ordinary doc now.
      { id: 'd_new', prompt: 'Scope and dates.', sync_holder: 'PROJECT:p1', last_sync_at: at(5) },
      { id: 'd_old', prompt: null, sync_holder: null, last_sync_at: null },
      { id: 'd_plain', prompt: null, sync_holder: null, last_sync_at: null }
    ]);

    const links = await rows(client, 'SELECT "id", "entity_type", "entity_id", "sync_source", "synced_at" FROM "link" ORDER BY "id"');
    expect(links).toEqual([
      // The doc's copy of a link the project already had is gone; the project's keeps the later sync.
      { id: 'l_file', entity_type: 'PROJECT', entity_id: 'p1', sync_source: 1, synced_at: null },
      { id: 'l_goal', entity_type: 'GOAL', entity_id: 'g1', sync_source: 1, synced_at: null },
      { id: 'l_old', entity_type: 'DOC', entity_id: 'd_old', sync_source: 0, synced_at: null },
      { id: 'l_page', entity_type: 'PAGE', entity_id: 'pg1', sync_source: 1, synced_at: null },
      { id: 'l_plain_page', entity_type: 'PAGE', entity_id: 'pg2', sync_source: 0, synced_at: null },
      { id: 'l_prd', entity_type: 'PROJECT', entity_id: 'p1', sync_source: 1, synced_at: at(5) },
      { id: 'l_project', entity_type: 'PROJECT', entity_id: 'p1', sync_source: 1, synced_at: at(4) }
    ]);
    client.close();
  });
});

describe('adoptStrayFileLinks', () => {
  it('moves the file of a link moved to another entity into that entity\'s folder, once', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const project = must(await createProject(reg, { name: 'Stray files' }));
    const doc = must(await addDoc(reg, 'PROJECT', project.id, { title: 'Brief' }));
    const file = must(await uploadLinkFile(reg, 'DOC', doc.id, { text: 'name,amount\nHosting,120\n' }, 'Budget.csv'));
    // As the migration leaves it: the row on the project, the file still in the doc's folder.
    await reg.prisma.link.update({ where: { id: file.id }, data: { entityType: 'PROJECT', entityId: project.id } });

    expect(await adoptStrayFileLinks(reg)).toBeGreaterThanOrEqual(1);
    const [moved] = must(await listLinks(reg, 'PROJECT', project.id));
    expect(moved?.url).toBe(file.url.replace(`docs/${doc.id}/`, `projects/${project.id}/`));
    expect(must(await readLinkFile(reg, file.id))).toMatchObject({ kind: 'text' });
    expect(await reg.storage.readObject(file.url.replace('storage://', ''))).toBeNull();
    expect(await adoptStrayFileLinks(reg)).toBe(0);
  });
});
