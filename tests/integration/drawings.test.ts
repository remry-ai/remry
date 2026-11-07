// Drawing pages (bodyType 'drawing') against the real database: a skeleton or a
// scene stored and validated, its text indexed (not its JSON), drawing blocks
// checked on a page save and turned into MENTIONS backlinks, and conversions
// that would lose a drawing refused.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { createPage, getPage, updatePage } from '../../src/api/page/operations';
import { addDoc, updateDoc } from '../../src/api/attached/doc/operations';
import { listRelationsForEntity } from '../../src/api/relation/operations';
import { convertEntity } from '../../src/api/convert/operations';
import { searchNotebook } from '../../src/api/search/operations';
import { drawingBlock } from '../../src/shared/types/drawing-blocks';
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
    expect(!convert.ok && convert.error.message).toMatch(/already has content as a drawing, so it can't become a document/);
  });
});

describe('drawing blocks', () => {
  it('embed a drawing page, link back to it, and are refused when they name no drawing', async () => {
    const drawing = await createDrawing('Architecture');
    const page = await createPage(reg, { title: 'Design notes', content: `How it fits:\n\n${drawingBlock(drawing)}` });
    if (!page.ok) throw page.error;
    const doc = await addDoc(reg, 'PERSON', 'person_bob', { title: 'Onboarding' });
    if (!doc.ok) throw doc.error;
    expect((await updateDoc(reg, doc.value.id, { content: `\`\`\`drawing\n${drawing}\n\`\`\`` })).ok).toBe(true);

    const backlinks = await listRelationsForEntity(reg, 'PAGE', drawing);
    expect(backlinks.ok && backlinks.value.flatMap((g) => g.items.map((i) => i.other.label)).sort()).toEqual(['Design notes', 'Onboarding']);

    const missing = await updatePage(reg, page.value.id, { content: 'Intro\n\n```drawing\n/app/wiki/cmnosuchpage00\n```' });
    expect(!missing.ok && missing.error.message).toBe('drawing block at line 3: page cmnosuchpage00 not found');
    const notDrawing = await createPage(reg, { title: 'Embeds a doc', content: `\`\`\`drawing\n/app/wiki/${page.value.id}\n\`\`\`` });
    expect(!notDrawing.ok && notDrawing.error.message).toMatch(/is a document, not a drawing/);
    const noPage = await createPage(reg, { title: 'Embeds nothing', content: '```drawing\nhello there\n```' });
    expect(!noPage.ok && noPage.error.message).toMatch(/drawing block at line 1: its body must be a drawing page's path/);
  });
});

describe('converting', () => {
  it("refuses to turn a drawing into a doc, a note or a project, or a tree that holds one", async () => {
    const drawing = await createDrawing('Network map');
    const toDoc = await convertEntity(reg, { entityType: 'PAGE', id: drawing, to: 'DOC', onType: 'PERSON', onId: 'person_bob' });
    expect(!toDoc.ok && toDoc.error.message).toMatch(/is a drawing, which a doc can't hold/);
    const toNote = await convertEntity(reg, { entityType: 'PAGE', id: drawing, to: 'NOTE', onType: 'PERSON', onId: 'person_bob' });
    expect(!toNote.ok && toNote.error.message).toMatch(/is a drawing, which a note can't hold/);
    const toProject = await convertEntity(reg, { entityType: 'PAGE', id: drawing, to: 'PROJECT' });
    expect(!toProject.ok && toProject.error.message).toMatch(/is a drawing, which can't become a project/);

    const parent = await createPage(reg, { title: 'Infra' });
    if (!parent.ok) throw parent.error;
    await updatePage(reg, drawing, { parentId: parent.value.id });
    const tree = await convertEntity(reg, { entityType: 'PAGE', id: parent.value.id, to: 'PROJECT' });
    expect(!tree.ok && tree.error.message).toMatch(/Drawing pages stay pages, so "Network map"/);
    expect((await getPage(reg, drawing)).ok).toBe(true);
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
