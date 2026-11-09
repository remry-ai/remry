// entity.deletePreview, the app's delete confirmation: it names everything attached to an
// entity (at any depth) that a delete takes with it, says where sub-items move, and what loses
// its owner; and the delete then removes exactly what it named.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { createProject, deleteProject } from '../../src/api/project/operations';
import { createPage, deletePage } from '../../src/api/page/operations';
import { createGoal, addGoalProject } from '../../src/api/goal/operations';
import { addDoc } from '../../src/api/attached/doc/operations';
import { createTodo } from '../../src/api/attached/todo/operations';
import { addNote } from '../../src/api/attached/note/operations';
import { addLink, uploadLinkFile } from '../../src/api/attached/link/operations';
import { previewDelete } from '../../src/api/entity/delete-preview';
import { TEST_NOTEBOOK } from './test-notebooks';

const reg = getRegistry(TEST_NOTEBOOK);

const value = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

describe('entity.deletePreview', () => {
  it('lists what a project delete takes with it, sub-projects included, and what it keeps', async () => {
    const parent = value(await createProject(reg, { name: 'Preview parent' }));
    const project = value(await createProject(reg, { name: 'Preview project', parentId: parent.id }));
    const child = value(await createProject(reg, { name: 'Preview sub-project', parentId: project.id }));
    const grandchild = value(await createProject(reg, { name: 'Preview sub-sub-project', parentId: child.id }));
    // Attached to a sub-project at depth: deleted too. A goal linked to it is kept (goals are loose).
    const childDoc = value(await addDoc(reg, 'PROJECT', grandchild.id, { title: 'Preview deep doc' }));
    const goal = value(await createGoal(reg, { title: 'Preview linked goal' }));
    value(await addGoalProject(reg, goal.id, grandchild.id));
    const doc = value(await addDoc(reg, 'PROJECT', project.id, { title: 'Preview plan' }));
    value(await createTodo(reg, { title: 'Preview todo', entityType: 'PROJECT', entityId: project.id }));
    // At depth: a todo and a note on the doc, not the project.
    value(await createTodo(reg, { title: 'Preview doc todo', entityType: 'DOC', entityId: doc.id }));
    value(await addNote(reg, 'DOC', doc.id, { content: 'On the doc' }));
    value(await addLink(reg, 'PROJECT', project.id, { url: 'https://example.com/spec', title: 'Spec' }));
    value(await uploadLinkFile(reg, 'PROJECT', project.id, { text: 'a,b' }, 'numbers.csv'));

    const preview = value(await previewDelete(reg, 'PROJECT', project.id));
    expect(preview.name).toBe('Preview project');
    expect(preview.docs.map((d) => d.title).sort()).toEqual(['Preview deep doc', 'Preview plan']);
    expect(preview.todos.map((t) => t.title).sort()).toEqual(['Preview doc todo', 'Preview todo']);
    expect(preview.notes).toBe(1);
    expect(preview.links.map((l) => l.title)).toEqual(['Spec']);
    expect(preview.files.map((f) => f.title)).toEqual(['numbers.csv']);
    expect(preview.children).toEqual([{ id: child.id, title: 'Preview sub-project' }, { id: grandchild.id, title: 'Preview sub-sub-project' }]);
    expect(preview.childrenDeleted).toBe(true);
    expect(preview.owned).toEqual([]);

    value(await deleteProject(reg, project.id));
    expect(await reg.prisma.doc.count({ where: { id: doc.id } })).toBe(0);
    expect(await reg.prisma.todo.count({ where: { title: { startsWith: 'Preview' } } })).toBe(0);
    expect(await reg.prisma.project.count({ where: { id: { in: [project.id, child.id, grandchild.id] } } })).toBe(0);
    expect(await reg.prisma.doc.count({ where: { id: childDoc.id } })).toBe(0);
    expect(await reg.prisma.project.count({ where: { id: parent.id } })).toBe(1);
    // The goal is kept; only its link to the deleted sub-project goes.
    expect(await reg.prisma.goal.count({ where: { id: goal.id } })).toBe(1);
    expect(await reg.prisma.goalProject.count({ where: { goalId: goal.id } })).toBe(0);
  });

  it('deletes a page with its sub-pages at any depth, and keeps its parent and siblings', async () => {
    const top = value(await createPage(reg, { title: 'Preview handbook' }));
    const page = value(await createPage(reg, { title: 'Preview chapter', parentId: top.id }));
    const sibling = value(await createPage(reg, { title: 'Preview other chapter', parentId: top.id }));
    const sub = value(await createPage(reg, { title: 'Preview section', parentId: page.id }));
    const subsub = value(await createPage(reg, { title: 'Preview subsection', parentId: sub.id }));
    value(await createTodo(reg, { title: 'Preview section todo', entityType: 'PAGE', entityId: subsub.id }));

    const preview = value(await previewDelete(reg, 'PAGE', page.id));
    expect(preview.children.map((c) => c.title)).toEqual(['Preview section', 'Preview subsection']);
    expect(preview.todos.map((t) => t.title)).toEqual(['Preview section todo']);

    value(await deletePage(reg, page.id));
    expect(await reg.prisma.page.count({ where: { id: { in: [page.id, sub.id, subsub.id] } } })).toBe(0);
    expect(await reg.prisma.page.count({ where: { id: { in: [top.id, sibling.id] } } })).toBe(2);
    expect(await reg.prisma.todo.count({ where: { title: 'Preview section todo' } })).toBe(0);
  });

  it('is empty for an entity with nothing attached, and refuses one that is gone', async () => {
    const lone = value(await createProject(reg, { name: 'Preview lone project' }));
    const preview = value(await previewDelete(reg, 'PROJECT', lone.id));
    expect(preview).toMatchObject({ docs: [], todos: [], files: [], links: [], notes: 0, children: [], owned: [] });
    expect((await previewDelete(reg, 'PAGE', 'no-such-page')).ok).toBe(false);
  });
});
