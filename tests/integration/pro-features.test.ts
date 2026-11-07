// Remry Pro's limits through the real router, without a license and then with one: full-text
// search and spreadsheets are free; a fourth drawing in a notebook, AI assist (Chat, /ask,
// Convert with Claude), Sync now and opening the app to other devices are Pro; and nothing
// already stored is ever locked: existing drawings stay editable, and turning remote access
// off always works. Nothing here reaches the network or runs Tailscale: each locked call is
// refused before it would.

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appRouter } from '../../src/shared/trpc/router';
import { createCallerFactory } from '../../src/shared/trpc/init';
import { createNotebookContext } from '../../src/shared/trpc/context.server';
import { resolveCurrentNotebook } from '../../src/shared/notebooks/current.server';
import { getRegistry } from '../../src/shared/registry.server';
import { countDrawings } from '../../src/api/_license';
import { testLicenseKey } from '../license-test-key';
import { TEST_NOTEBOOK } from './test-notebooks';

const reg = getRegistry(TEST_NOTEBOOK);
const settingsFile = resolve('data/test/settings.json');
const settingsJson = (): Record<string, unknown> => JSON.parse(readFileSync(settingsFile, 'utf8')) as Record<string, unknown>;
const withoutLicense = (): void => {
  const { licenseKey: _dropped, ...rest } = settingsJson();
  writeFileSync(settingsFile, JSON.stringify(rest));
};
const withLicense = (): void => writeFileSync(settingsFile, JSON.stringify({ ...settingsJson(), licenseKey: testLicenseKey() }));

const caller = async () => {
  const notebook = await resolveCurrentNotebook({ explicit: TEST_NOTEBOOK });
  if (!notebook.ok) throw notebook.error;
  return createCallerFactory(appRouter)(await createNotebookContext(notebook.value));
};

interface Outcome {
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: { readonly message: string };
}
const idOf = (outcome: Outcome): string => {
  if (!outcome.ok) throw new Error(outcome.error?.message);
  return (outcome.value as { id: string }).id;
};
const refusal = (outcome: Outcome): string => (outcome.ok ? '(it ran)' : outcome.error?.message ?? '');

const LIMIT = /^This notebook has \d+ drawings?, and 3 are free in each notebook; more are part of Remry Pro\./;
const skeleton = JSON.stringify({ skeleton: [{ type: 'rectangle', id: 'a', label: { text: 'Queue' } }] });

describe('without a license', () => {
  it('keeps full-text search and recall free', async () => {
    withoutLicense();
    const api = await caller();
    expect((await api.search.query({ q: 'alice' })).ok).toBe(true);
    expect((await api.search.recall({ entityType: 'PERSON', entityId: 'person_alice' })).ok).toBe(true);
  });

  it('allows 3 drawings, pages and docs together, then refuses every way of making a fourth', async () => {
    withoutLicense();
    const api = await caller();
    expect(await countDrawings(reg)).toBe(0);
    idOf(await api.page.create({ title: 'Flow', bodyType: 'drawing' }));
    idOf(await api.doc.add({ entityType: 'PERSON', entityId: 'person_alice', title: 'Alice map', bodyType: 'drawing' }));
    const third = idOf(await api.doc.add({ entityType: 'PERSON', entityId: 'person_bob', title: 'Bob map', bodyType: 'drawing' }));
    expect(await countDrawings(reg)).toBe(3);

    expect(refusal(await api.page.create({ title: 'Fourth', bodyType: 'drawing' }))).toMatch(LIMIT);
    expect(refusal(await api.doc.add({ entityType: 'PERSON', entityId: 'person_carol', title: 'Fourth', bodyType: 'drawing' }))).toMatch(LIMIT);
    // Turning an empty page or doc into a drawing makes one too.
    const blankPage = idOf(await api.page.create({ title: 'Blank page' }));
    expect(refusal(await api.page.update({ id: blankPage, bodyType: 'drawing' }))).toMatch(LIMIT);
    const blankDoc = idOf(await api.doc.add({ entityType: 'PERSON', entityId: 'person_carol', title: 'Blank doc' }));
    expect(refusal(await api.doc.update({ id: blankDoc, bodyType: 'drawing' }))).toMatch(LIMIT);
    // An Excalidraw link into a new page or doc is refused before anything is fetched.
    expect(refusal(await api.drawing.importLink({ url: 'https://excalidraw.com/#json=abc,def', title: 'Imported' }))).toMatch(LIMIT);
    expect(refusal(await api.drawing.importLink({ url: 'https://excalidraw.com/#json=abc,def', title: 'Imported', entityType: 'PERSON', entityId: 'person_carol' }))).toMatch(LIMIT);
    // Nothing was made, and what was refused stayed as it was.
    expect(await countDrawings(reg)).toBe(3);
    const blank = await api.page.get({ id: blankPage });
    expect(blank.ok && blank.value.bodyType).toBe('doc');

    // Existing drawings stay fully editable.
    expect((await api.doc.update({ id: third, title: 'Bob map, v2', content: skeleton })).ok).toBe(true);
    expect((await api.doc.update({ id: third, bodyType: 'drawing' })).ok).toBe(true);
  });

  it('keeps spreadsheets unlimited', async () => {
    withoutLicense();
    const api = await caller();
    for (const n of [1, 2, 3, 4, 5]) idOf(await api.page.create({ title: `Sheet ${n}`, bodyType: 'sheet' }));
    for (const n of [1, 2]) idOf(await api.doc.add({ entityType: 'PERSON', entityId: 'person_alice', title: `Sheet doc ${n}`, bodyType: 'sheet' }));
  });

  it('counts archived drawings, frees a place when one is deleted, and lets a drawing convert at the limit', async () => {
    withoutLicense();
    const api = await caller();
    const flow = (await api.page.list({ archived: 'include' }));
    const flowId = (flow.ok ? flow.value : []).find((p) => p.title === 'Flow')!.id;
    // Archiving doesn't free a place.
    expect((await api.entity.archive({ entityType: 'PAGE', id: flowId })).ok).toBe(true);
    expect(refusal(await api.page.create({ title: 'After archiving', bodyType: 'drawing' }))).toMatch(LIMIT);
    expect((await api.entity.archive({ entityType: 'PAGE', id: flowId, archived: false })).ok).toBe(true);

    // A drawing page moved onto a person as a doc is still one drawing, so it's allowed at the limit.
    const converted = await api.entity.convert({ entityType: 'PAGE', id: flowId, to: 'DOC', onType: 'PERSON', onId: 'person_carol' });
    expect(converted.ok).toBe(true);
    expect(await countDrawings(reg)).toBe(3);

    // Deleting one frees its place, and only that one.
    const docs = await api.doc.list({ entityType: 'PERSON', entityId: 'person_alice' });
    const aliceMap = (docs.ok ? docs.value : []).find((d) => d.title === 'Alice map')!.id;
    expect((await api.entity.delete({ entityType: 'DOC', id: aliceMap })).ok).toBe(true);
    idOf(await api.page.create({ title: 'In its place', bodyType: 'drawing' }));
    expect(refusal(await api.page.create({ title: 'One more', bodyType: 'drawing' }))).toMatch(LIMIT);
  });

  it('locks AI assist and Sync now, but not reading a file link\'s text', async () => {
    withoutLicense();
    const api = await caller();
    expect(refusal(await api.chat.send({ entityType: 'PERSON', entityId: 'person_alice', entityName: 'Alice', pageText: 'Alice', content: 'Hi' })))
      .toMatch(/^AI assist is part of Remry Pro\./);
    expect(refusal(await api.chat.ask({ question: 'Who is Alice?' }))).toMatch(/^AI assist is part of Remry Pro\./);
    expect(refusal(await api.link.convert({ id: 'link_none' }))).toMatch(/^AI assist is part of Remry Pro\./);
    expect(refusal(await api.sync.now({ entityType: 'PAGE', id: 'page_none' }))).toMatch(/^Sync now is part of Remry Pro\./);
    // Re-read (saving a file's text) stays free: it fails here only because the link doesn't exist.
    expect(refusal(await api.link.transcribe({ id: 'link_none' }))).not.toContain('Remry Pro');
  });

  it('locks opening the app to other devices, but turning it off always works', async () => {
    withoutLicense();
    const api = await caller();
    expect(refusal(await api.remoteAccess.set({ tailscale: true }))).toMatch(/^Opening Remry on other devices is part of Remry Pro\./);
    expect(refusal(await api.remoteAccess.set({ hostname: 'my-mac.tail1234.ts.net' }))).toMatch(/^Opening Remry on other devices is part of Remry Pro\./);
    expect(settingsJson()['tailnetHost']).toBeUndefined();
    expect((await api.remoteAccess.set({ hostname: null })).ok).toBe(true);
  });
});

describe('with a license', () => {
  it('makes drawings past the free ones', async () => {
    withLicense();
    const api = await caller();
    const before = await countDrawings(reg);
    expect(before).toBeGreaterThanOrEqual(3);
    for (const n of [1, 2, 3]) idOf(await api.page.create({ title: `Pro drawing ${n}`, bodyType: 'drawing' }));
    const blankDoc = idOf(await api.doc.add({ entityType: 'PERSON', entityId: 'person_bob', title: 'Pro blank' }));
    expect((await api.doc.update({ id: blankDoc, bodyType: 'drawing' })).ok).toBe(true);
    expect(await countDrawings(reg)).toBe(before + 4);
  });

  it('opens the AI, sync and other-devices gates (each then does its own checks)', async () => {
    withLicense();
    const api = await caller();
    expect(refusal(await api.link.convert({ id: 'link_none' }))).not.toContain('Remry Pro');
    expect(refusal(await api.sync.now({ entityType: 'PAGE', id: 'page_none' }))).not.toContain('Remry Pro');
    expect((await api.remoteAccess.set({ hostname: 'my-mac.tail1234.ts.net' })).ok).toBe(true);
    expect(settingsJson()['tailnetHost']).toBe('my-mac.tail1234.ts.net');
    expect((await api.remoteAccess.set({ hostname: null })).ok).toBe(true);
  });

  it('leaves drawings made with Pro editable after the license goes', async () => {
    withoutLicense();
    const api = await caller();
    const pages = await api.page.list({});
    const proDrawing = (pages.ok ? pages.value : []).find((p) => p.title === 'Pro drawing 3')!.id;
    expect((await api.page.update({ id: proDrawing, title: 'Still mine', content: skeleton })).ok).toBe(true);
    expect(refusal(await api.page.create({ title: 'No more', bodyType: 'drawing' }))).toMatch(LIMIT);
  });
});
