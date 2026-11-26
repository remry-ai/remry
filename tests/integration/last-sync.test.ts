// A sync doc's or page's last sync, against the real database: Claude marking one of the entity's
// sources synced records a sync by Claude (keeping the row's updatedAt), Sync now's outcome is
// saved, and sync.needed and doc.list say which sync docs want syncing, leaving out archived ones.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { appRouter } from '../../src/shared/trpc/router';
import { createCallerFactory } from '../../src/shared/trpc/init';
import { createNotebookContext } from '../../src/shared/trpc/context.server';
import { resolveCurrentNotebook } from '../../src/shared/notebooks/current.server';
import { getRegistry } from '../../src/shared/registry.server';
import { createProject } from '../../src/api/project/operations';
import { addDoc } from '../../src/api/attached/doc/operations';
import { createPage } from '../../src/api/page/operations';
import { addLink } from '../../src/api/attached/link/operations';
import { saveSyncText, setSyncPrompt } from '../../src/api/attached/sync/operations';
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
  const holder = { entityType: 'PROJECT' as const, entityId: project.id };
  const docId = value(await setSyncPrompt(reg, holder, 'Scope and dates.')).docId;
  if (!docId) throw new Error('no sync doc');
  value(await saveSyncText(reg, holder, '# Brief'));
  const link = value(await addLink(reg, 'PROJECT', project.id, { url: `https://linear.app/acme/project/${project.id}`, title: 'Linear: project', syncSource: true }));
  return { project, doc: { id: docId }, link };
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

  it('records a sync by Claude for a source added as synced, only on a synced entity', async () => {
    const api = await caller();
    const page = value(await createPage(reg, { title: 'Vendors (last sync)', content: '# Vendors' }));
    value(await api.link.add({ entityType: 'PAGE', entityId: page.id, url: 'https://notion.so/acme/vendors', synced: true }));
    expect(value(await api.page.get({ id: page.id })).lastSync).toBeNull();

    value(await setSyncPrompt(reg, { entityType: 'PAGE', entityId: page.id }, 'Pricing only.'));
    // A link that isn't one of its sources isn't a sync of it.
    value(await api.link.add({ entityType: 'PAGE', entityId: page.id, url: 'https://notion.so/acme/terms', synced: true }));
    expect(value(await api.page.get({ id: page.id })).lastSync).toBeNull();
    value(await api.link.add({ entityType: 'PAGE', entityId: page.id, url: 'https://notion.so/acme/pricing', synced: true, syncSource: true }));
    expect(value(await api.page.get({ id: page.id })).lastSync).toMatchObject({ by: 'CLAUDE', outcome: 'OK' });
  });

  it('is recorded by sync.save, which writes the read-only text and marks the sources it names', async () => {
    const api = await caller();
    const { project, doc, link } = await syncDocOnProject('Saved (last sync)');
    value(await api.sync.save({ entityType: 'PROJECT', entityId: project.id, content: '# Brief v2', syncedLinkIds: [link.id] }));
    const saved = value(await api.doc.get({ id: doc.id }));
    expect(saved).toMatchObject({ content: '# Brief v2', isSync: true, lastSync: { by: 'CLAUDE', outcome: 'OK' } });
    expect((await reg.prisma.link.findUniqueOrThrow({ where: { id: link.id } })).syncedAt).toBeInstanceOf(Date);
    const view = value(await api.sync.get({ entityType: 'PROJECT', entityId: project.id }));
    expect(view).toMatchObject({ prompt: 'Scope and dates.', docId: doc.id, syncNeed: null });
    expect(view.sources.map((s) => s.id)).toEqual([link.id]);
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
    // all: every unarchived one, the current ones last with no need.
    const every = value(await api.sync.needed({ all: true }));
    const everyIds = every.map((n) => n.id);
    expect(everyIds).toEqual(expect.arrayContaining([fresh.doc.id, failed.doc.id, never.doc.id]));
    expect(everyIds).not.toContain(archived.doc.id);
    expect(every.find((n) => n.id === fresh.doc.id)).toMatchObject({ need: null });
    expect(every.at(-1)?.need).toBeNull();

    const listed = value(await api.doc.list({ entityType: 'PROJECT', entityId: failed.project.id }));
    expect(listed.map((d) => d.syncNeed)).toEqual(['failed']);
    const current = value(await api.doc.list({ entityType: 'PROJECT', entityId: fresh.project.id }));
    expect(current.map((d) => d.syncNeed)).toEqual([null]);
    // The sync doc is listed first, before docs added earlier.
    value(await addDoc(reg, 'PROJECT', fresh.project.id, { title: 'Notes' }));
    const both = value(await api.doc.list({ entityType: 'PROJECT', entityId: fresh.project.id }));
    expect(both.map((d) => d.isSync)).toEqual([true, false]);
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
    // As a notebook was before the migration: the prompt and the sources on the doc, and only the sources kept a time.
    const project = value(await createProject(reg, { name: 'Backfill (last sync)' }));
    const doc = value(await addDoc(reg, 'PROJECT', project.id, { title: 'Backfill brief' }));
    await reg.prisma.doc.update({ where: { id: doc.id }, data: { prompt: 'Scope.' } });
    const link = value(await addLink(reg, 'DOC', doc.id, { url: 'https://linear.app/acme/backfill', synced: true }));
    const plain = value(await addDoc(reg, 'PROJECT', project.id, { title: 'Notes' }));
    value(await addLink(reg, 'DOC', plain.id, { url: 'https://example.com/notes', synced: true }));
    const syncedAt = (await reg.prisma.link.findUniqueOrThrow({ where: { id: link.id } })).syncedAt;
    await reg.prisma.$executeRawUnsafe(`UPDATE "doc" SET "last_sync_at" = NULL, "last_sync_by" = NULL, "last_sync_outcome" = NULL WHERE "id" IN ('${doc.id}', '${plain.id}')`);

    const sql = readFileSync('prisma/migrations/20261106120000_last_sync/migration.sql', 'utf8');
    for (const statement of sql.split(';').map((s) => s.replace(/--.*$/gm, '').trim()).filter((s) => s.startsWith('UPDATE "doc"'))) {
      await reg.prisma.$executeRawUnsafe(`${statement} AND "id" IN ('${doc.id}', '${plain.id}')`);
    }
    const api = await caller();
    expect(value(await api.doc.get({ id: doc.id })).lastSync).toEqual({ at: syncedAt, by: null, outcome: 'OK', message: null });
    expect(value(await api.doc.get({ id: plain.id })).lastSync).toBeNull();
  });
});
