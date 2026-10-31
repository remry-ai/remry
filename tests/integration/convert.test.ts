// entity.convert against the real database: a project tree into wiki pages and back,
// docs and notes into pages and pages into docs and notes, with what's attached to each
// following it and links elsewhere rewritten.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { convertEntity } from '../../src/api/convert/operations';
import { createProject, getProject } from '../../src/api/project/operations';
import { addGoalProject, createGoal } from '../../src/api/goal/operations';
import { createPage, getPage, listPages } from '../../src/api/page/operations';
import { addDoc, listDocs, updateDoc, uploadDocImage } from '../../src/api/attached/doc/operations';
import { addNote, listNotes } from '../../src/api/attached/note/operations';
import { createTodo, listTodosForEntity } from '../../src/api/attached/todo/operations';
import { addLink, listLinks, readLinkFile, uploadLinkFile } from '../../src/api/attached/link/operations';
import { attachTag, createTag } from '../../src/api/attached/tag/operations';
import { addRelation } from '../../src/api/relation/operations';
import { TEST_NOTEBOOK } from './test-notebooks';

const must = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

const PNG = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
const PDF = Buffer.from('%PDF-1.4\n%%EOF').toString('base64');

describe('entity.convert', () => {
  it('turns a project, its sub-project and docs into a page tree, keeping what was attached', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const project = must(await createProject(reg, { name: 'Migration', description: 'Move to Postgres.', status: 'in-progress', ownerType: 'PERSON', ownerId: 'person_alice' }));
    const sub = must(await createProject(reg, { name: 'Schema work', parentId: project.id }));
    const goal = must(await createGoal(reg, { title: 'Faster queries' }));
    must(await addGoalProject(reg, goal.id, project.id));

    const doc = must(await addDoc(reg, 'PROJECT', project.id, { title: 'Plan' }));
    const image = must(await uploadDocImage(reg, doc.id, PNG));
    must(await updateDoc(reg, doc.id, { content: `Steps\n\n${image.markdown}`, prompt: 'PRD: scope' }));
    must(await addLink(reg, 'DOC', doc.id, { url: 'https://notion.so/plan', synced: true }));

    must(await addNote(reg, 'PROJECT', project.id, { content: 'Kicked off' }));
    must(await createTodo(reg, { title: 'Book review', entityType: 'PROJECT', entityId: project.id }));
    must(await addLink(reg, 'PROJECT', project.id, { url: 'https://linear.app/x' }));
    const tag = must(await createTag(reg, { name: 'convert-test' }));
    must(await attachTag(reg, tag.id, 'PROJECT', project.id));
    must(await addRelation(reg, { fromType: 'PERSON', fromId: 'person_bob', toType: 'PROJECT', toId: project.id, kind: 'RELATED' }));
    const elsewhere = must(await createPage(reg, { title: 'Roadmap', content: `See [Migration](/app/projects/${project.id}).` }));

    const result = must(await convertEntity(reg, { entityType: 'PROJECT', id: project.id, to: 'PAGE' }));
    expect(result.entityType).toBe('PAGE');
    expect(result.created.map((c) => c.title)).toEqual(['Migration', 'Schema work', 'Plan']);
    expect(result.relinked).toBe(1);
    expect((await getProject(reg, project.id)).ok).toBe(false);
    expect((await getProject(reg, sub.id)).ok).toBe(false);

    const page = must(await getPage(reg, result.id));
    expect(page.content).toContain('- **Status:** In progress');
    expect(page.content).toContain('[Alice Johnson](/app/people/person_alice)');
    expect(page.content).toContain(`[Faster queries](/app/goals/${goal.id})`);
    expect(page.content).toContain('Move to Postgres.');
    expect(page.children.map((c) => c.title)).toEqual(['Schema work', 'Plan']);

    const plan = must(await getPage(reg, page.children[1]!.id));
    expect(plan.prompt).toBe('PRD: scope');
    expect(plan.content).toMatch(new RegExp(`storage://pages/${plan.id}/image-`));
    expect(must(await listLinks(reg, 'PAGE', plan.id)).map((l) => l.url)).toEqual(['https://notion.so/plan']);

    expect(must(await listNotes(reg, 'PAGE', page.id)).map((n) => n.content)).toEqual(['Kicked off']);
    expect((await listTodosForEntity(reg, 'PAGE', page.id)).map((t) => t.title)).toEqual(['Book review']);
    expect(await reg.prisma.tagAttachment.count({ where: { entityType: 'PAGE', entityId: page.id } })).toBe(1);
    expect(await reg.prisma.relation.count({ where: { fromType: 'PERSON', fromId: 'person_bob', toType: 'PAGE', toId: page.id } })).toBe(1);

    expect(must(await getPage(reg, elsewhere.id)).content).toBe(`See [Migration](/app/wiki/${page.id}).`);
    expect(await reg.prisma.relation.count({ where: { fromId: elsewhere.id, toType: 'PAGE', toId: page.id, kind: 'MENTIONS' } })).toBe(1);
    expect(await reg.prisma.relation.count({ where: { OR: [{ fromId: project.id }, { toId: project.id }] } })).toBe(0);
  });

  it('turns a page tree into a project with sub-projects, its text into docs', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const page = must(await createPage(reg, { title: 'Garden shed', content: 'Build a shed.' }));
    const sheet = JSON.stringify({ columns: [{ title: 'Item' }, { title: 'Cost' }], data: [['Wood', '300']] });
    must(await createPage(reg, { title: 'Shed budget', bodyType: 'sheet', content: sheet, parentId: page.id }));
    must(await addNote(reg, 'PAGE', page.id, { content: 'Ordered wood' }));

    const result = must(await convertEntity(reg, { entityType: 'PAGE', id: page.id, to: 'PROJECT', description: 'A shed by spring.', status: 'committed' }));
    expect(result.created.map((c) => `${c.entityType} ${c.title}`)).toEqual(['PROJECT Garden shed', 'DOC Garden shed', 'PROJECT Shed budget', 'DOC Shed budget']);
    const project = must(await getProject(reg, result.id));
    expect(project).toMatchObject({ description: 'A shed by spring.', status: 'committed' });
    expect(project.children.map((c) => c.name)).toEqual(['Shed budget']);
    expect(must(await listDocs(reg, 'PROJECT', project.id)).map((d) => d.content)).toEqual(['Build a shed.']);
    const budget = must(await listDocs(reg, 'PROJECT', project.children[0]!.id));
    expect(budget[0]!.content).toBe('| Item | Cost |\n| --- | --- |\n| Wood | 300 |');
    expect(must(await listNotes(reg, 'PROJECT', project.id)).map((n) => n.content)).toEqual(['Ordered wood']);
    expect((await getPage(reg, page.id)).ok).toBe(false);

    // And back: each doc becomes a sub-page again.
    const again = must(await convertEntity(reg, { entityType: 'PROJECT', id: project.id, to: 'PAGE' }));
    expect(must(await getPage(reg, again.id)).children.map((c) => c.title)).toEqual(['Shed budget', 'Garden shed']);
  });

  it('moves files uploaded as links with them, and refuses a name in use, a page with files or sub-pages as a note or doc', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    must(await createProject(reg, { name: 'Taken name' }));
    const page = must(await createPage(reg, { title: 'Taken name' }));
    const taken = await convertEntity(reg, { entityType: 'PAGE', id: page.id, to: 'PROJECT' });
    expect(!taken.ok && taken.error.message).toContain('allowDuplicate');

    const project = must(await createProject(reg, { name: 'Has a PDF' }));
    const doc = must(await addDoc(reg, 'PROJECT', project.id, { title: 'Contract' }));
    const file = must(await uploadLinkFile(reg, 'DOC', doc.id, { dataBase64: PDF }, 'Contract.pdf'));
    const converted = must(await convertEntity(reg, { entityType: 'DOC', id: doc.id, to: 'PAGE' }));
    // The PDF moved into the page's folder, the doc's going with it, and still reads.
    const [moved] = must(await listLinks(reg, 'PAGE', converted.id));
    expect(moved?.url).toBe(file.url.replace(`docs/${doc.id}/`, `pages/${converted.id}/`));
    expect(must(await readLinkFile(reg, moved!.id)).kind).toBe('pdf');
    // The doc's old project is related to the page it became.
    expect(await reg.prisma.relation.count({ where: { fromType: 'PROJECT', fromId: project.id, toType: 'PAGE', toId: converted.id } })).toBe(1);
    // A note can't hold the file.
    const asNote = await convertEntity(reg, { entityType: 'PAGE', id: converted.id, to: 'NOTE', onType: 'PROJECT', onId: project.id });
    expect(!asNote.ok && asNote.error.message).toContain("files uploaded as links, which a note can't hold");

    const parent = must(await createPage(reg, { title: 'Parent' }));
    must(await createPage(reg, { title: 'Child', parentId: parent.id }));
    const withChildren = await convertEntity(reg, { entityType: 'PAGE', id: parent.id, to: 'DOC', onType: 'PROJECT', onId: project.id });
    expect(!withChildren.ok && withChildren.error.message).toContain('sub-page');

    const wrong = await convertEntity(reg, { entityType: 'NOTE', id: 'x', to: 'PROJECT' });
    expect(!wrong.ok && wrong.error.message).toContain("can't be converted");
  });

  it('turns a note and its replies into a page, and a page into a note or a doc', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const project = must(await createProject(reg, { name: 'Notes home' }));
    const note = must(await addNote(reg, 'PROJECT', project.id, { content: '## Vendor review\nThey were late twice.' }));
    const reply = must(await addNote(reg, 'PROJECT', project.id, { content: 'Agreed', parentId: note.id }));
    must(await addNote(reg, 'PROJECT', project.id, { content: 'Me too', parentId: reply.id }));

    const page = must(await convertEntity(reg, { entityType: 'NOTE', id: note.id, to: 'PAGE' }));
    expect(page.title).toBe('Vendor review');
    const replies = must(await listNotes(reg, 'PAGE', page.id));
    expect(replies.map((n) => [n.content, n.parentId === null])).toEqual([['Agreed', true], ['Me too', false]]);
    expect(must(await listNotes(reg, 'PROJECT', project.id))).toEqual([]);

    const back = must(await convertEntity(reg, { entityType: 'PAGE', id: page.id, to: 'NOTE', onType: 'PROJECT', onId: project.id }));
    const notes = must(await listNotes(reg, 'PROJECT', project.id));
    const top = notes.find((n) => n.id === back.id);
    expect(top?.content).toBe('**Vendor review**\n\n## Vendor review\nThey were late twice.');
    expect(notes.find((n) => n.content === 'Agreed')?.parentId).toBe(back.id);

    const wiki = must(await createPage(reg, { title: 'Runbook', content: 'Restart it.' }));
    const asDoc = must(await convertEntity(reg, { entityType: 'PAGE', id: wiki.id, to: 'DOC', onType: 'PROJECT', onId: project.id }));
    expect(asDoc.path).toBe(`/app/projects/${project.id}?doc=${asDoc.id}`);
    expect(must(await listDocs(reg, 'PROJECT', project.id)).map((d) => d.content)).toEqual(['Restart it.']);
    expect(must(await listPages(reg, {})).some((p) => p.id === wiki.id)).toBe(false);
  });
});
