// entity.deletePreview, the app's delete confirmation: it names everything attached to an
// entity (at any depth) that a delete takes with it, says where sub-items move, and what loses
// its owner; and the delete then removes exactly what it named.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { createProject, deleteProject } from '../../src/api/project/operations';
import { createGoal } from '../../src/api/goal/operations';
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
  it('lists what a project delete takes with it, and what it keeps', async () => {
    const parent = value(await createProject(reg, { name: 'Preview parent' }));
    const project = value(await createProject(reg, { name: 'Preview project', parentId: parent.id }));
    const child = value(await createProject(reg, { name: 'Preview sub-project', parentId: project.id }));
    const owned = value(await createGoal(reg, { title: 'Preview owned goal', ownerType: 'PROJECT', ownerId: project.id }));
    const doc = value(await addDoc(reg, 'PROJECT', project.id, { title: 'Preview plan' }));
    value(await createTodo(reg, { title: 'Preview todo', entityType: 'PROJECT', entityId: project.id }));
    // At depth: a todo and a note on the doc, not the project.
    value(await createTodo(reg, { title: 'Preview doc todo', entityType: 'DOC', entityId: doc.id }));
    value(await addNote(reg, 'DOC', doc.id, { content: 'On the doc' }));
    value(await addLink(reg, 'PROJECT', project.id, { url: 'https://example.com/spec', title: 'Spec' }));
    value(await uploadLinkFile(reg, 'PROJECT', project.id, { text: 'a,b' }, 'numbers.csv'));

    const preview = value(await previewDelete(reg, 'PROJECT', project.id));
    expect(preview.name).toBe('Preview project');
    expect(preview.docs.map((d) => d.title)).toEqual(['Preview plan']);
    expect(preview.todos.map((t) => t.title).sort()).toEqual(['Preview doc todo', 'Preview todo']);
    expect(preview.notes).toBe(1);
    expect(preview.links.map((l) => l.title)).toEqual(['Spec']);
    expect(preview.files.map((f) => f.title)).toEqual(['numbers.csv']);
    expect(preview.children).toEqual([{ id: child.id, title: 'Preview sub-project' }]);
    expect(preview.movesTo).toBe('Preview parent');
    expect(preview.owned).toEqual([{ type: 'GOAL', id: owned.id, title: 'Preview owned goal' }]);

    value(await deleteProject(reg, project.id));
    expect(await reg.prisma.doc.count({ where: { id: doc.id } })).toBe(0);
    expect(await reg.prisma.todo.count({ where: { title: { startsWith: 'Preview' } } })).toBe(0);
    expect((await reg.prisma.project.findUnique({ where: { id: child.id } }))?.parentId).toBe(parent.id);
    expect((await reg.prisma.goal.findUnique({ where: { id: owned.id } }))?.ownerId).toBeNull();
  });

  it('is empty for an entity with nothing attached, and refuses one that is gone', async () => {
    const lone = value(await createProject(reg, { name: 'Preview lone project' }));
    const preview = value(await previewDelete(reg, 'PROJECT', lone.id));
    expect(preview).toMatchObject({ docs: [], todos: [], files: [], links: [], notes: 0, children: [], owned: [] });
    expect((await previewDelete(reg, 'PAGE', 'no-such-page')).ok).toBe(false);
  });
});
