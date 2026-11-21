// Syncing an entity, against the real database: a first prompt makes its one sync doc, which only
// a sync writes (doc.update, doc.remove, an image upload and moving it are refused, saying what to
// do instead); clearing the prompt leaves an ordinary doc and stops its links being sources; only
// an entity that can be synced has sources.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { createProject } from '../../src/api/project/operations';
import { createGoal } from '../../src/api/goal/operations';
import { addDoc, getDoc, listDocs, removeDoc, updateDoc, uploadDocImage } from '../../src/api/attached/doc/operations';
import { addLink, listLinks, updateLink } from '../../src/api/attached/link/operations';
import { getSync, saveSyncText, setSyncPrompt } from '../../src/api/attached/sync/operations';
import { setArchived } from '../../src/api/_archive';
import { appRouter } from '../../src/shared/trpc/router';
import { createCallerFactory } from '../../src/shared/trpc/init';
import { createNotebookContext } from '../../src/shared/trpc/context.server';
import { resolveCurrentNotebook } from '../../src/shared/notebooks/current.server';
import { TEST_NOTEBOOK } from './test-notebooks';

const reg = getRegistry(TEST_NOTEBOOK);
const PNG = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');

const must = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

const refusal = (result: { ok: boolean; error?: Error }): string => (result.ok ? '(it ran)' : result.error?.message ?? '');

describe('a sync doc', () => {
  it('is made by a first prompt, once per entity, first among its docs, named for it', async () => {
    const project = must(await createProject(reg, { name: 'Payments' }));
    const holder = { entityType: 'PROJECT' as const, entityId: project.id };
    must(await addDoc(reg, 'PROJECT', project.id, { title: 'Notes' }));
    expect(must(await getSync(reg, holder))).toMatchObject({ prompt: null, docId: null });

    const { docId } = must(await setSyncPrompt(reg, holder, '  Linear: status and dates.  '));
    // A new prompt keeps the same doc.
    expect(must(await setSyncPrompt(reg, holder, 'Linear: status, dates and owners.')).docId).toBe(docId);
    const docs = must(await listDocs(reg, 'PROJECT', project.id));
    expect(docs.map((d) => [d.title, d.isSync, d.prompt])).toEqual([
      ['Payments brief', true, 'Linear: status, dates and owners.'],
      ['Notes', false, null]
    ]);
  });

  it('is written only by a sync, and refuses edits by hand saying what to do', async () => {
    const project = must(await createProject(reg, { name: 'Read-only brief' }));
    const other = must(await createProject(reg, { name: 'Elsewhere' }));
    const holder = { entityType: 'PROJECT' as const, entityId: project.id };
    const docId = must(await setSyncPrompt(reg, holder, 'Scope.')).docId!;

    expect(refusal(await updateDoc(reg, docId, { content: 'By hand' }))).toContain('not the editor');
    expect(refusal(await updateDoc(reg, docId, { title: 'Renamed' }))).toContain('sync doc');
    expect(refusal(await updateDoc(reg, docId, { entityType: 'PROJECT', entityId: other.id }))).toContain('sync doc');
    expect(refusal(await uploadDocImage(reg, docId, PNG))).toContain('sync doc');
    expect(refusal(await removeDoc(reg, docId))).toContain('clear the entity\'s prompt');

    must(await saveSyncText(reg, holder, '## Scope\nCheckout.'));
    expect(must(await getDoc(reg, docId))).toMatchObject({ content: '## Scope\nCheckout.', title: 'Read-only brief brief' });
  });

  it('becomes an ordinary doc when the prompt is cleared, and its entity\'s links stop being sources', async () => {
    const goal = must(await createGoal(reg, { title: 'Ship v2' }));
    const holder = { entityType: 'GOAL' as const, entityId: goal.id };
    const docId = must(await setSyncPrompt(reg, holder, 'Dates.')).docId!;
    const link = must(await addLink(reg, 'GOAL', goal.id, { url: 'https://linear.app/acme/v2', syncSource: true }));
    must(await saveSyncText(reg, holder, '# v2', [{ id: link.id }]));
    expect(must(await getSync(reg, holder)).sources.map((s) => s.id)).toEqual([link.id]);

    must(await setSyncPrompt(reg, holder, null));
    expect(must(await getDoc(reg, docId))).toMatchObject({ isSync: false, prompt: null, lastSync: null, content: '# v2' });
    expect(must(await listLinks(reg, 'GOAL', goal.id)).map((l) => l.syncSource)).toEqual([false]);
    must(await updateDoc(reg, docId, { content: 'Edited by hand now.' }));
    must(await removeDoc(reg, docId));
    // A sync needs a prompt.
    expect(refusal(await saveSyncText(reg, holder, '# again'))).toContain('sync.setPrompt');
  });

  it('is refused on an archived entity, and sources only on an entity that can be synced', async () => {
    const project = must(await createProject(reg, { name: 'Archived sync' }));
    must(await setArchived(reg, 'PROJECT', project.id, true));
    expect((await setSyncPrompt(reg, { entityType: 'PROJECT', entityId: project.id }, 'Scope.')).ok).toBe(false);

    const live = must(await createProject(reg, { name: 'Has a doc' }));
    const doc = must(await addDoc(reg, 'PROJECT', live.id, { title: 'Plain' }));
    expect(refusal(await addLink(reg, 'DOC', doc.id, { url: 'https://example.com/a', syncSource: true }))).toContain('sync sources');
    const plain = must(await addLink(reg, 'DOC', doc.id, { url: 'https://example.com/b' }));
    expect(refusal(await updateLink(reg, plain.id, { syncSource: true }))).toContain('sync sources');
    const onProject = must(await addLink(reg, 'PROJECT', live.id, { url: 'https://example.com/c' }));
    must(await updateLink(reg, onProject.id, { syncSource: true }));
    expect(must(await listLinks(reg, 'PROJECT', live.id)).map((l) => l.syncSource)).toEqual([true]);
  });

  it('refuses a prompt on doc.update or page.update, saying where it went, for a session that started before the update', async () => {
    const notebook = await resolveCurrentNotebook({ explicit: TEST_NOTEBOOK });
    if (!notebook.ok) throw notebook.error;
    const api = createCallerFactory(appRouter)(await createNotebookContext(notebook.value));
    const project = must(await createProject(reg, { name: 'Stale session' }));
    const doc = must(await addDoc(reg, 'PROJECT', project.id, { title: 'Plan' }));
    // As an older session's tool sends it; without the check, Zod would drop the key and report success.
    const stale = { id: doc.id, prompt: 'Scope.' } as unknown as Parameters<typeof api.doc.update>[0];
    await expect(api.doc.update(stale)).rejects.toThrow(/sync\.setPrompt/);
    const page = must(await api.page.create({ title: 'Stale page' }));
    await expect(api.page.update({ id: page.id, prompt: null } as unknown as Parameters<typeof api.page.update>[0])).rejects.toThrow(/start a new Claude session/);
    // Everything else is as before.
    expect((await api.doc.update({ id: doc.id, title: 'Plan v2' })).ok).toBe(true);
    expect(must(await getDoc(reg, doc.id)).title).toBe('Plan v2');
  });

  it('takes its text from Claude\'s tools (the CLI and MCP), though not a new title or a move', async () => {
    const notebook = await resolveCurrentNotebook({ explicit: TEST_NOTEBOOK });
    if (!notebook.ok) throw notebook.error;
    const api = createCallerFactory(appRouter)(await createNotebookContext(notebook.value));
    const project = must(await createProject(reg, { name: 'Written by Cowork' }));
    const docId = must(await setSyncPrompt(reg, { entityType: 'PROJECT', entityId: project.id }, 'Scope.')).docId!;
    expect((await api.doc.update({ id: docId, content: '## Scope\nFrom Cowork.' })).ok).toBe(true);
    expect(must(await getDoc(reg, docId)).content).toBe('## Scope\nFrom Cowork.');
    expect((await api.doc.uploadImage({ docId, dataBase64: PNG })).ok).toBe(true);
    const renamed = await api.doc.update({ id: docId, title: 'Renamed' });
    expect(!renamed.ok && renamed.error.message).toContain('sync doc');

    const page = must(await api.page.create({ title: 'Synced from Cowork' }));
    must(await setSyncPrompt(reg, { entityType: 'PAGE', entityId: page.id }, 'Tiers.'));
    expect((await api.page.update({ id: page.id, content: '# Tiers' })).ok).toBe(true);
  });
});
