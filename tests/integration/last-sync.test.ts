// A sync doc's or page's last sync, against the real database: Claude marking a source synced
// records a sync by Claude (keeping the row's updatedAt), Sync now's outcome is saved, and
// sync.needed and doc.list say which sync docs want syncing, leaving out archived ones.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { appRouter } from '../../src/shared/trpc/router';
import { createCallerFactory } from '../../src/shared/trpc/init';
import { createNotebookContext } from '../../src/shared/trpc/context.server';
import { resolveCurrentNotebook } from '../../src/shared/notebooks/current.server';
import { getRegistry } from '../../src/shared/registry.server';
import { createProject } from '../../src/api/project/operations';
import { addDoc, updateDoc } from '../../src/api/attached/doc/operations';
import { createPage, updatePage } from '../../src/api/page/operations';
import { addLink } from '../../src/api/attached/link/operations';
import { recordSync } from '../../src/api/_last-sync';
import { recallEntity } from '../../src/api/search/recall';
import { TEST_NOTEBOOK } from './test-notebooks';

const reg = getRegistry(TEST_NOTEBOOK);

const caller = async () => {
  const notebook = await resolveCurrentNotebook({ explicit: TEST_NOTEBOOK });
  if (!notebook.ok) throw notebook.error;
  return createCallerFactory(appRouter)(await createNotebookContext(notebook.value));
};

const value = <T>(result: { readonly ok: boolean; readonly value?: T; readonly error?: unknown }): T => {
  if (!result.ok) throw result.error;
  return result.value as T;
};

const syncDocOnProject = async (name: string) => {
  const project = value(await createProject(reg, { name }));
  const doc = value(await addDoc(reg, 'PROJECT', project.id, { title: `${name} brief` }));
  value(await updateDoc(reg, doc.id, { content: '# Brief', prompt: 'Scope and dates.' }));
  const link = value(await addLink(reg, 'DOC', doc.id, { url: `https://linear.app/acme/project/${doc.id}`, title: 'Linear: project' }));
  return { project, doc, link };
};

describe('last sync', () => {
  it('is recorded as Claude\'s when Claude marks a source synced, without moving updatedAt', async () => {
    const api = await caller();
    const { doc, link } = await syncDocOnProject('Checkout (last sync)');
    const before = value(await api.doc.get({ id: doc.id }));
    expect(before.lastSync).toBeNull();

    value(await api.link.markSynced({ id: link.id, sourceEditedAt: new Date('2026-10-01T09:00:00Z') }));
    const after = value(await api.doc.get({ id: doc.id }));
    expect(after.lastSync).toMatchObject({ by: 'CLAUDE', outcome: 'OK', message: null });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('records a sync by Claude for a link added as synced, only on a sync doc or page', async () => {
    const api = await caller();
    const page = value(await createPage(reg, { title: 'Vendors (last sync)', content: '# Vendors' }));
    value(await api.link.add({ entityType: 'PAGE', entityId: page.id, url: 'https://notion.so/acme/vendors', synced: true }));
    expect(value(await api.page.get({ id: page.id })).lastSync).toBeNull();

    value(await updatePage(reg, page.id, { prompt: 'Pricing only.' }));
    value(await api.link.add({ entityType: 'PAGE', entityId: page.id, url: 'https://notion.so/acme/pricing', synced: true }));
    expect(value(await api.page.get({ id: page.id })).lastSync).toMatchObject({ by: 'CLAUDE', outcome: 'OK' });
  });

  it('lists sync docs that want syncing, and marks them in doc.list', async () => {
    const api = await caller();
    const fresh = await syncDocOnProject('Fresh (last sync)');
    const failed = await syncDocOnProject('Failed (last sync)');
    const never = await syncDocOnProject('Never (last sync)');
    const archived = await syncDocOnProject('Archived (last sync)');
    await recordSync(reg, 'DOC', fresh.doc.id, { by: 'APP', outcome: 'OK' });
    await recordSync(reg, 'DOC', failed.doc.id, { by: 'APP', outcome: 'FAILED', message: 'Claude Code exited without a reply.' });
    value(await api.entity.archive({ entityType: 'PROJECT', id: archived.project.id }));

    const needed = value(await api.sync.needed());
    const ids = needed.map((n) => n.id);
    expect(ids).toContain(failed.doc.id);
    expect(ids).toContain(never.doc.id);
    expect(ids).not.toContain(fresh.doc.id);
    expect(ids).not.toContain(archived.doc.id);
    // Failed ones come first, with the reason and where the doc is.
    expect(needed[0]).toMatchObject({ need: 'failed', lastSync: { message: 'Claude Code exited without a reply.' } });
    expect(needed.find((n) => n.id === never.doc.id)).toMatchObject({ need: 'never', on: { label: 'Never (last sync)' } });

    const listed = value(await api.doc.list({ entityType: 'PROJECT', entityId: failed.project.id }));
    expect(listed.map((d) => d.syncNeed)).toEqual(['failed']);
    const current = value(await api.doc.list({ entityType: 'PROJECT', entityId: fresh.project.id }));
    expect(current.map((d) => d.syncNeed)).toEqual([null]);
  });
});

describe('search.recall', () => {
  it('gives each sync doc its last sync and whether it wants one, so Claude can say how current it is', async () => {
    const { project, doc } = await syncDocOnProject('Recall (last sync)');
    await recordSync(reg, 'DOC', doc.id, { by: 'APP', outcome: 'FAILED', message: 'Notion MCP server not connected.' });
    const plain = value(await addDoc(reg, 'PROJECT', project.id, { title: 'Meeting notes' }));

    const recalled = value(await recallEntity(reg, 'PROJECT', project.id));
    const byId = new Map(recalled.docs.items.map((d) => [d.id, d]));
    expect(byId.get(doc.id)).toMatchObject({ syncNeed: 'failed', lastSync: { by: 'APP', outcome: 'FAILED', message: 'Notion MCP server not connected.' } });
    expect(byId.get(plain.id)).toMatchObject({ syncNeed: null, lastSync: null });
  });
});

describe('the last_sync migration', () => {
  it('gives an existing sync doc its newest source\'s sync time, and leaves an ordinary doc alone', async () => {
    const api = await caller();
    const { doc, link } = await syncDocOnProject('Backfill (last sync)');
    const plainProject = value(await createProject(reg, { name: 'Backfill plain (last sync)' }));
    const plain = value(await addDoc(reg, 'PROJECT', plainProject.id, { title: 'Notes' }));
    value(await addLink(reg, 'DOC', plain.id, { url: 'https://example.com/notes', synced: true }));
    value(await api.link.markSynced({ id: link.id }));
    const syncedAt = (await reg.prisma.link.findUniqueOrThrow({ where: { id: link.id } })).syncedAt;
    // As a notebook was before the migration: only the sources kept a time.
    await reg.prisma.$executeRawUnsafe('UPDATE "doc" SET "last_sync_at" = NULL, "last_sync_by" = NULL, "last_sync_outcome" = NULL');

    const sql = readFileSync('prisma/migrations/20261106120000_last_sync/migration.sql', 'utf8');
    for (const statement of sql.split(';').map((s) => s.replace(/--.*$/gm, '').trim()).filter((s) => s.startsWith('UPDATE'))) {
      await reg.prisma.$executeRawUnsafe(statement);
    }
    expect(value(await api.doc.get({ id: doc.id })).lastSync).toEqual({ at: syncedAt, by: null, outcome: 'OK', message: null });
    expect(value(await api.doc.get({ id: plain.id })).lastSync).toBeNull();
  });
});
