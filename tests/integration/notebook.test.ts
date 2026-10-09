// Smoke test: the core notebook flow works with no user or org.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { getPerson } from '../../src/api/person/operations';
import { getGroup as getTeam } from '../../src/api/group/operations';
import { createTeam, addTeamMember } from './org-helpers';
import { addNote, listNotes } from '../../src/api/attached/note/operations';
import { createTodo, listTodosForEntity } from '../../src/api/attached/todo/operations';
import { createTag, attachTag, listTagsForEntity } from '../../src/api/attached/tag/operations';
import { TEST_NOTEBOOK } from './test-notebooks';

describe('notebook smoke', () => {
  it('person → team membership → note → todo → tag', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);

    const team = await createTeam(reg, { name: 'Platform' });
    expect(team.ok).toBe(true);
    if (!team.ok) return;

    expect((await addTeamMember(reg, team.value.id, { personId: 'person_alice' })).ok).toBe(true);
    const detail = await getTeam(reg, team.value.id);
    expect(detail.ok && detail.value.members.map((m) => m.personName)).toEqual(['Alice Johnson']);

    const person = await getPerson(reg, 'person_alice');
    expect(person.ok && person.value.groups.map((g) => g.name)).toEqual(['Platform']);

    await addNote(reg, 'PERSON', 'person_alice', { content: 'Wants to lead the Q4 migration.' });
    const notes = await listNotes(reg, 'PERSON', 'person_alice');
    expect(notes.ok && notes.value.map((n) => n.content)).toEqual(['Wants to lead the Q4 migration.']);

    await createTodo(reg, { title: 'Book 1:1', entityType: 'PERSON', entityId: 'person_alice' });
    const todos = await listTodosForEntity(reg, 'PERSON', 'person_alice');
    expect(todos.map((t) => [t.title, t.status, t.entityLabel])).toEqual([['Book 1:1', 'PENDING', 'Alice Johnson']]);

    const tag = await createTag(reg, { name: 'high-potential' });
    expect(tag.ok).toBe(true);
    if (!tag.ok) return;
    await attachTag(reg, tag.value.id, 'PERSON', 'person_alice');
    const tags = await listTagsForEntity(reg, 'PERSON', 'person_alice');
    expect(tags.ok && tags.value.map((t) => t.name)).toEqual(['high-potential']);
  });
});
