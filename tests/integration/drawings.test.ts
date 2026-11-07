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
