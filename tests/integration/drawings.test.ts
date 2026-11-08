// Drawing pages (bodyType 'drawing') against the real database: a skeleton or a
// scene stored and validated, its text indexed (not its JSON), old drawing
// blocks turned into MENTIONS backlinks, drawings kept as drawings between
// pages and docs, spreadsheet and drawing docs, and share links.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { createPage, getPage, updatePage } from '../../src/api/page/operations';
import { addDoc, getDoc, updateDoc } from '../../src/api/attached/doc/operations';
import { recallEntity } from '../../src/api/search/recall';
import { listRelationsForEntity } from '../../src/api/relation/operations';
import { convertEntity } from '../../src/api/convert/operations';
import { searchNotebook } from '../../src/api/search/operations';
import { importShareLink, shareDrawing } from '../../src/api/drawing/operations';
import { encryptScene } from '../../src/shared/drawing/excalidraw-link';
import type { ExcalidrawBackend } from '../../src/shared/drawing/excalidraw-backend.server';
import { ok, err } from '../../src/shared/utils/result';
import { TEST_NOTEBOOK } from './test-notebooks';

const reg = getRegistry(TEST_NOTEBOOK);

const skeleton = {
  layout: 'right',
  skeleton: [
    { type: 'rectangle', id: 'ingest', label: { text: 'Ingest queue' } },
    { type: 'diamond', id: 'check', label: { text: 'Valid payload?' } },
    { type: 'rectangle', id: 'store', label: { text: 'Warehouse' } },
    { type: 'arrow', start: { id: 'ingest' }, end: { id: 'check' } },
    { type: 'arrow', start: { id: 'check' }, end: { id: 'store' }, label: { text: 'yes' } },
    { type: 'text', text: 'Retries go back to the zebrafish lane' }
  ]
};

const createDrawing = async (title: string, content: unknown = skeleton): Promise<string> => {
  const page = await createPage(reg, { title, bodyType: 'drawing', content: JSON.stringify(content) });
  if (!page.ok) throw page.error;
  return page.value.id;
};

const indexedBody = async (id: string): Promise<string> => {
  const rows = await reg.prisma.$queryRawUnsafe<{ body: string }[]>("SELECT body FROM search_index WHERE entity_type = 'PAGE' AND entity_id = ?", id);
  return rows[0]?.body ?? '';
};

describe('drawing pages', () => {
  it('store a skeleton, index its text, and refuse a bad one with what is wrong', async () => {
    const id = await createDrawing('Pipeline');
    const page = await getPage(reg, id);
    if (!page.ok) throw page.error;
    expect(page.value.bodyType).toBe('drawing');
    expect(JSON.parse(page.value.content)).toMatchObject({ version: 1, layout: 'right', skeleton: skeleton.skeleton });

    const body = await indexedBody(id);
    expect(body).toContain('Valid payload?');
    expect(body).toContain('zebrafish');
    expect(body).not.toContain('skeleton');
    expect(body).not.toContain('rectangle');
    const hits = await searchNotebook(reg, { q: 'zebrafish' });
    expect(hits.ok && hits.value.results.map((r) => r.entityId)).toContain(id);
    const keys = await searchNotebook(reg, { q: 'rectangle' });
    expect(keys.ok && keys.value.results.map((r) => r.entityId)).not.toContain(id);

    const bad = await updatePage(reg, id, { content: JSON.stringify({ skeleton: [{ type: 'arrow', start: { id: 'nowhere' } }] }) });
    expect(!bad.ok && bad.error.message).toMatch(/drawing content: skeleton\.0\.start\.id "nowhere"/);
    const notJson = await createPage(reg, { title: 'Oops', bodyType: 'drawing', content: '# a heading' });
    expect(!notJson.ok && notJson.error.message).toMatch(/drawing content: invalid JSON/);
  });

  it('store the scene the app saves, and index its text elements', async () => {
    const id = await createDrawing('Scene');
    const scene = { version: 1, elements: [{ id: 'e1', type: 'text', text: 'Quokka\nsignals', originalText: 'Quokka signals' }, { id: 'e2', type: 'rectangle', isDeleted: true }] };
    const saved = await updatePage(reg, id, { content: JSON.stringify(scene) });
    expect(saved.ok).toBe(true);
    const page = await getPage(reg, id);
    expect(page.ok && JSON.parse(page.value.content).elements).toHaveLength(1);
    expect(await indexedBody(id)).toBe('Quokka signals');
  });

  it('change body type only while empty, either way', async () => {
    const blank = await createPage(reg, { title: 'Whiteboard' });
    if (!blank.ok) throw blank.error;
    expect((await updatePage(reg, blank.value.id, { bodyType: 'drawing' })).ok).toBe(true);
    const empty = await getPage(reg, blank.value.id);
    expect(empty.ok && JSON.parse(empty.value.content)).toEqual({ version: 1, elements: [] });

    const id = await createDrawing('Full');
    const convert = await updatePage(reg, id, { bodyType: 'doc' });
    expect(!convert.ok && convert.error.message).toMatch(/already has content as a drawing, so it can't become a doc\b/);
  });
});

describe('drawing blocks', () => {
  it('from before drawings were only pages save as they are and still link back to the drawing', async () => {
    const drawing = await createDrawing('Architecture');
    const page = await createPage(reg, { title: 'Design notes', content: `How it fits:\n\n\`\`\`drawing\n/app/wiki/${drawing}\n\`\`\`` });
    if (!page.ok) throw page.error;
    const doc = await addDoc(reg, 'PERSON', 'person_bob', { title: 'Onboarding' });
    if (!doc.ok) throw doc.error;
    expect((await updateDoc(reg, doc.value.id, { content: `See the [architecture](/app/wiki/${drawing}).` })).ok).toBe(true);

    const backlinks = await listRelationsForEntity(reg, 'PAGE', drawing);
    expect(backlinks.ok && backlinks.value.flatMap((g) => g.items.map((i) => i.other.label)).sort()).toEqual(['Design notes', 'Onboarding']);
    // No longer checked: drawings aren't shown inside other text.
    expect((await updatePage(reg, page.value.id, { content: '```drawing\n/app/wiki/cmnosuchpage00\n```' })).ok).toBe(true);
  });
});

describe('converting', () => {
  it('keeps a drawing a drawing between a page and a doc, and refuses a note', async () => {
    const drawing = await createDrawing('Network map');
    const toNote = await convertEntity(reg, { entityType: 'PAGE', id: drawing, to: 'NOTE', onType: 'PERSON', onId: 'person_bob' });
    expect(!toNote.ok && toNote.error.message).toMatch(/is a drawing, which a note can't hold/);

    const toDoc = await convertEntity(reg, { entityType: 'PAGE', id: drawing, to: 'DOC', onType: 'PERSON', onId: 'person_bob' });
    if (!toDoc.ok) throw toDoc.error;
    const docId = toDoc.value.created[0]!.id;
    const doc = await getDoc(reg, docId);
    expect(doc.ok && doc.value.bodyType).toBe('drawing');
    expect(doc.ok && JSON.parse(doc.value.content)).toMatchObject({ skeleton: skeleton.skeleton });

    const back = await convertEntity(reg, { entityType: 'DOC', id: docId, to: 'PAGE' });
    if (!back.ok) throw back.error;
    const page = await getPage(reg, back.value.created[0]!.id);
    expect(page.ok && page.value.bodyType).toBe('drawing');

    const parent = await createPage(reg, { title: 'Infra' });
    if (!parent.ok) throw parent.error;
    await updatePage(reg, back.value.created[0]!.id, { parentId: parent.value.id });
    const tree = await convertEntity(reg, { entityType: 'PAGE', id: parent.value.id, to: 'PROJECT' });
    if (!tree.ok) throw tree.error;
    expect(tree.value.created.map((c) => `${c.entityType} ${c.title}`)).toEqual(['PROJECT Infra', 'PROJECT Network map', 'DOC Network map']);
  });
});

describe('spreadsheet and drawing docs', () => {
  it('start empty in their shape, validate, index their text, and change type only while empty', async () => {
    const sheet = await addDoc(reg, 'PERSON', 'person_alice', { title: 'Budget', bodyType: 'sheet' });
    if (!sheet.ok) throw sheet.error;
    const blank = await getDoc(reg, sheet.value.id);
    expect(blank.ok && blank.value.bodyType).toBe('sheet');
    expect(blank.ok && JSON.parse(blank.value.content).columns.length).toBeGreaterThan(0);

    const bad = await updateDoc(reg, sheet.value.id, { content: '# a heading' });
    expect(!bad.ok && bad.error.message).toMatch(/sheet content: invalid JSON/);
    const filled = await updateDoc(reg, sheet.value.id, { content: JSON.stringify({ columns: [{ title: 'Item' }], data: [['Platypus feed']] }) });
    expect(filled.ok).toBe(true);
    const rows = await reg.prisma.$queryRawUnsafe<{ body: string }[]>("SELECT body FROM search_index WHERE entity_type = 'DOC' AND entity_id = ?", sheet.value.id);
    expect(rows[0]?.body).toBe('Platypus feed');
    const recall = await recallEntity(reg, 'PERSON', 'person_alice');
    expect(recall.ok && recall.value.docs.items.find((d) => d.id === sheet.value.id)?.excerpt).toContain('Platypus feed');

    const toDrawing = await updateDoc(reg, sheet.value.id, { bodyType: 'drawing' });
    expect(!toDrawing.ok && toDrawing.error.message).toMatch(/already has content as a spreadsheet, so it can't become a drawing/);
    const sync = await updateDoc(reg, sheet.value.id, { prompt: 'Pull the costs' });
    expect(!sync.ok && sync.error.message).toMatch(/can't be a sync doc/);

    const doc = await addDoc(reg, 'PERSON', 'person_alice', { title: 'Sketch' });
    if (!doc.ok) throw doc.error;
    expect((await updateDoc(reg, doc.value.id, { bodyType: 'drawing', content: JSON.stringify(skeleton) })).ok).toBe(true);
    const drawn = await reg.prisma.$queryRawUnsafe<{ body: string }[]>("SELECT body FROM search_index WHERE entity_type = 'DOC' AND entity_id = ?", doc.value.id);
    expect(drawn[0]?.body).toContain('zebrafish');
    expect(drawn[0]?.body).not.toContain('rectangle');
  });
});

// A stand-in for excalidraw.com's storage: what Remry uploads, by id.
const fakeExcalidraw = (): ExcalidrawBackend & { readonly stored: Map<string, Uint8Array> } => {
  const stored = new Map<string, Uint8Array>();
  return {
    stored,
    post: async (payload) => {
      const id = `id${stored.size + 1}`;
      stored.set(id, payload);
      return ok(id);
    },
    get: async (id) => {
      const bytes = stored.get(id);
      return bytes ? ok(bytes) : err(new Error('excalidraw.com has no drawing for that link'));
    }
  };
};

describe('share links', () => {
  const scene = { version: 1, elements: [{ id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 50 }, { id: 't1', type: 'text', text: 'Shared box', originalText: 'Shared box' }] };

  it('upload an encrypted copy and import it back into a new page or an empty one', async () => {
    const backend = fakeExcalidraw();
    const id = await createDrawing('To share', scene);
    const shared = await shareDrawing(reg, backend, id);
    if (!shared.ok) throw shared.error;
    expect(shared.value.url).toMatch(/^https:\/\/excalidraw\.com\/#json=id1,[A-Za-z0-9_-]{22}$/);
    // Excalidraw gets only ciphertext.
    expect(new TextDecoder().decode(backend.stored.get('id1'))).not.toContain('Shared box');

    const imported = await importShareLink(reg, backend, { url: shared.value.url, title: 'Imported' });
    if (!imported.ok) throw imported.error;
    expect(imported.value).toMatchObject({ elements: 2, imagesLeftOut: 0 });
    const page = await getPage(reg, imported.value.id);
    expect(page.ok && page.value.bodyType).toBe('drawing');
    expect(page.ok && JSON.parse(page.value.content).elements.map((e: { id: string }) => e.id)).toEqual(['r1', 't1']);
    expect(await indexedBody(imported.value.id)).toBe('Shared box');

    const empty = await createPage(reg, { title: 'Empty canvas', bodyType: 'drawing' });
    if (!empty.ok) throw empty.error;
    expect((await importShareLink(reg, backend, { url: shared.value.url, pageId: empty.value.id })).ok).toBe(true);
    const full = await importShareLink(reg, backend, { url: shared.value.url, pageId: empty.value.id });
    expect(!full.ok && full.error.message).toMatch(/already has a drawing\. Pass replace: true/);
    expect((await importShareLink(reg, backend, { url: shared.value.url, pageId: empty.value.id, replace: true })).ok).toBe(true);
  });

  it('work for a drawing doc too: share it, and import into a new doc or an empty one', async () => {
    const backend = fakeExcalidraw();
    const doc = await addDoc(reg, 'PERSON', 'person_carol', { title: 'Whiteboard', bodyType: 'drawing' });
    if (!doc.ok) throw doc.error;
    expect((await updateDoc(reg, doc.value.id, { content: JSON.stringify(scene) })).ok).toBe(true);
    const shared = await shareDrawing(reg, backend, { docId: doc.value.id });
    if (!shared.ok) throw shared.error;

    const imported = await importShareLink(reg, backend, { url: shared.value.url, title: 'Copy', entityType: 'PERSON', entityId: 'person_carol' });
    if (!imported.ok) throw imported.error;
    expect(imported.value.path).toBe(`/app/people/person_carol?doc=${imported.value.id}`);
    const copy = await getDoc(reg, imported.value.id);
    expect(copy.ok && copy.value.bodyType).toBe('drawing');
    const full = await importShareLink(reg, backend, { url: shared.value.url, docId: doc.value.id });
    expect(!full.ok && full.error.message).toMatch(/already has a drawing/);
    const text = await addDoc(reg, 'PERSON', 'person_carol', { title: 'Words' });
    if (!text.ok) throw text.error;
    const notDrawing = await shareDrawing(reg, backend, { docId: text.value.id });
    expect(!notDrawing.ok && notDrawing.error.message).toMatch(/isn't a drawing doc/);
  });

  it('refuse what they cannot share or read, before any request', async () => {
    const backend = fakeExcalidraw();
    const skeletonPage = await createDrawing('Never opened');
    const notOpened = await shareDrawing(reg, backend, skeletonPage);
    expect(!notOpened.ok && notOpened.error.message).toMatch(/hasn't been opened in the app yet/);
    const blank = await createPage(reg, { title: 'Blank', bodyType: 'drawing' });
    if (!blank.ok) throw blank.error;
    expect(!(await shareDrawing(reg, backend, blank.value.id)).ok).toBe(true);
    const doc = await createPage(reg, { title: 'Just text', content: 'hello' });
    if (!doc.ok) throw doc.error;
    const notDrawing = await shareDrawing(reg, backend, doc.value.id);
    expect(!notDrawing.ok && notDrawing.error.message).toMatch(/isn't a drawing page/);
    expect(backend.stored.size).toBe(0);

    const room = await importShareLink(reg, backend, { url: 'https://excalidraw.com/#room=abc,def', title: 'X' });
    expect(!room.ok && room.error.message).toMatch(/live-collaboration/);
    const noWhere = await importShareLink(reg, backend, { url: 'https://excalidraw.com/#json=id9,gTleNQIdt1vGTjnqe9rZyA' });
    expect(!noWhere.ok && noWhere.error.message).toMatch(/Say where the drawing goes/);
    const gone = await importShareLink(reg, backend, { url: 'https://excalidraw.com/#json=id9,gTleNQIdt1vGTjnqe9rZyA', title: 'X' });
    expect(!gone.ok && gone.error.message).toMatch(/no drawing for that link/);
  });

  it('say how many pictures a shared drawing had, which a drawing leaves out', async () => {
    const backend = fakeExcalidraw();
    const file = { type: 'excalidraw', version: 2, elements: [{ id: 'i1', type: 'image', fileId: 'f' }, { id: 'e1', type: 'ellipse' }], files: { f: {} } };
    const { payload, key } = await encryptScene(JSON.stringify(file));
    const id = (await backend.post(payload)).ok ? 'id1' : '';
    const imported = await importShareLink(reg, backend, { url: `https://excalidraw.com/#json=${id},${key}`, title: 'With a photo' });
    expect(imported.ok && imported.value).toMatchObject({ elements: 1, imagesLeftOut: 1 });
  });
});
