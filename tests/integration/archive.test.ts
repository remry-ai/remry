// Archiving against the real database: archived entities leave lists, the org
// map and the home feed, stay readable, refuse writes to themselves and what's
// attached to them, and can still be deleted.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { setArchived } from '../../src/api/_archive';
import { getPerson, listPersons, updatePerson } from '../../src/api/person/operations';
import { listGroupsWithMembers } from '../../src/api/group/operations';
import { addTeamMember, createTeam } from './org-helpers';
import { createProject, deleteProject, getProject, listProjects, updateProject } from '../../src/api/project/operations';
import { addNote } from '../../src/api/attached/note/operations';
import { createTodo, listTodos } from '../../src/api/attached/todo/operations';
import { addRelation } from '../../src/api/relation/operations';
import { listOpenTodos, listRecentUpdates } from '../../src/api/home/operations';
import { TEST_NOTEBOOK } from './test-notebooks';

describe('archiving', () => {
  it('hides an archived person from lists and the org map, keeps them readable, and blocks writes', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const team = await createTeam(reg, { name: 'Archive Team' });
    if (!team.ok) throw new Error('setup failed');
    expect((await addTeamMember(reg, team.value.id, { personId: 'person_bob' })).ok).toBe(true);
    await createTodo(reg, { title: 'Bob follow-up', entityType: 'PERSON', entityId: 'person_bob' });

    const archived = await setArchived(reg, 'PERSON', 'person_bob', true);
    expect(archived.ok && archived.value.archivedAt).toBeInstanceOf(Date);

    const active = await listPersons(reg);
    expect(active.ok && active.value.map((p) => p.id)).not.toContain('person_bob');
    const only = await listPersons(reg, 'only');
    expect(only.ok && only.value.map((p) => p.id)).toEqual(['person_bob']);

    const teams = await listGroupsWithMembers(reg);
    const archiveTeam = teams.ok ? teams.value.find((t) => t.id === team.value.id) : undefined;
    expect(archiveTeam?.members).toEqual([]);

    const bob = await getPerson(reg, 'person_bob');
    expect(bob.ok && bob.value.archivedAt).toBeInstanceOf(Date);

    const update = await updatePerson(reg, 'person_bob', { extensions: { org: { title: 'Staff' } } });
    expect(update.ok).toBe(false);
    if (!update.ok) expect(update.error.message).toContain('person.unarchive --id person_bob');
    expect((await addNote(reg, 'PERSON', 'person_bob', { content: 'Too late' })).ok).toBe(false);
    expect((await addTeamMember(reg, team.value.id, { personId: 'person_bob' })).ok).toBe(false);

    const todos = await listOpenTodos(reg);
    expect(todos.ok && todos.value.items.some((t) => t.title === 'Bob follow-up')).toBe(false);
    expect((await listTodos(reg)).some((t) => t.title === 'Bob follow-up')).toBe(false);
    expect((await listTodos(reg, { archived: 'include' })).some((t) => t.title === 'Bob follow-up')).toBe(true);

    // Unarchived, everything works again.
    await setArchived(reg, 'PERSON', 'person_bob', false);
    expect((await updatePerson(reg, 'person_bob', { extensions: { org: { title: 'Staff' } } })).ok).toBe(true);
  });

  it('hides an archived project from the feed, allows relations to it, and still deletes it', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const old = await createProject(reg, { name: 'Checkout v1' });
    const next = await createProject(reg, { name: 'Checkout v3' });
    if (!old.ok || !next.ok) throw new Error('setup failed');

    await setArchived(reg, 'PROJECT', old.value.id, true);

    const listed = await listProjects(reg);
    expect(listed.ok && listed.value.map((p) => p.name)).not.toContain('Checkout v1');
    const updates = await listRecentUpdates(reg);
    expect(updates.ok && updates.value.some((u) => u.id === old.value.id)).toBe(false);

    expect((await updateProject(reg, old.value.id, { status: 'done' })).ok).toBe(false);
    expect((await addRelation(reg, {
      fromType: 'PROJECT', fromId: next.value.id, toType: 'PROJECT', toId: old.value.id, kind: 'DEPENDS_ON'
    })).ok).toBe(true);
    expect((await addRelation(reg, {
      fromType: 'PROJECT', fromId: old.value.id, toType: 'PROJECT', toId: next.value.id, kind: 'RELATED'
    })).ok).toBe(false);

    expect((await deleteProject(reg, old.value.id)).ok).toBe(true);
    expect((await getProject(reg, old.value.id)).ok).toBe(false);
  });
});
