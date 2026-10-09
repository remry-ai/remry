// Smoke test: the home dashboard surfaces todos, updates and the focus graph.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { createTeam } from './org-helpers';
import { notebookModel } from '../../src/shared/modules/model';

const work = notebookModel('work');
const home = notebookModel('home');
import { createTodo } from '../../src/api/attached/todo/operations';
import { addNote } from '../../src/api/attached/note/operations';
import { listOpenTodos, listRecentUpdates } from '../../src/api/home/operations';
import { getFocusGraph } from '../../src/api/home/focus-graph';
import { TEST_NOTEBOOK } from './test-notebooks';

describe('home smoke', () => {
  it('todos by priority, updates without people', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);

    const team = await createTeam(reg, { name: 'Home Feed Team' });
    expect(team.ok).toBe(true);
    if (!team.ok) return;
    await addNote(reg, 'PERSON', 'person_alice', { content: 'Private person note' });

    await createTodo(reg, { title: 'Low', priority: 0, entityType: 'PERSON', entityId: 'person_alice' });
    await createTodo(reg, { title: 'Urgent', priority: 3, entityType: 'PERSON', entityId: 'person_alice' });

    const todos = await listOpenTodos(reg);
    expect(todos.ok && todos.value.items[0]?.title).toBe('Urgent');

    const started = await createTodo(reg, { title: 'Started', priority: 0, entityType: 'PERSON', entityId: 'person_alice' });
    if (!started.ok) return;
    await reg.prisma.todo.update({ where: { id: started.value.id }, data: { status: 'ACTIVE' } });
    const byStatus = await listOpenTodos(reg, 200, 'status');
    expect(byStatus.ok && byStatus.value.items[0]?.status).toBe('ACTIVE');
    const byPriority = await listOpenTodos(reg, 200);
    expect(byPriority.ok && byPriority.value.items[0]?.title).not.toBe('Started');
    const secondPage = await listOpenTodos(reg, 1, 'priority', 1);
    expect(secondPage.ok && secondPage.value.items.length).toBe(1);
    expect(secondPage.ok && secondPage.value.items[0]?.id).toBe(byPriority.ok ? byPriority.value.items[1]?.id : undefined);
    expect(secondPage.ok && secondPage.value.total).toBe(byPriority.ok ? byPriority.value.total : -1);

    const updates = await listRecentUpdates(reg);
    expect(updates.ok).toBe(true);
    if (!updates.ok) return;
    expect(updates.value.some((u) => u.kind === 'GROUP' && u.id === team.value.id)).toBe(true);
    expect(updates.value.some((u) => u.kind === 'PERSON')).toBe(false);
    expect(updates.value.some((u) => u.kind === 'NOTE' && u.title === 'Private person note')).toBe(false);

  });

  it('focus graph: one hop of links, grouped by how they read, archived left out', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const p = reg.prisma;

    const lead = await p.person.create({ data: { name: 'Focus Lead' } });
    const report = await p.person.create({ data: { name: 'Focus Report' } });
    const gone = await p.person.create({ data: { name: 'Focus Gone', archivedAt: new Date() } });
    await p.personRelation.createMany({ data: [report.id, gone.id].map((id) => ({ fromPersonId: lead.id, toPersonId: id, kind: 'LEAD_OF' })) });
    const team = await p.group.create({ data: { name: 'Focus Team', kind: 'TEAM' } });
    const family = await p.groupKind.upsert({ where: { key: 'FAMILY' }, create: { key: 'FAMILY', name: 'Family', plural: 'Families' }, update: {} });
    const cousins = await p.group.create({ data: { name: 'Focus Cousins', kind: family.key } });
    await p.groupMember.createMany({ data: [{ groupId: team.id, personId: lead.id }, { groupId: cousins.id, personId: lead.id }] });
    const project = await p.project.create({ data: { name: 'Focus Project', ownerType: 'PERSON', ownerId: lead.id } });
    const upstream = await p.project.create({ data: { name: 'Focus Upstream' } });
    await p.relation.create({ data: { fromType: 'PROJECT', fromId: project.id, toType: 'PROJECT', toId: upstream.id, kind: 'DEPENDS_ON' } });
    const goal = await p.goal.create({ data: { title: 'Focus Goal' } });
    await p.goalProject.create({ data: { goalId: goal.id, projectId: project.id } });
    await createTodo(reg, { title: 'Focus todo', entityType: 'PROJECT', entityId: project.id });

    const labelsOf = (graph: Awaited<ReturnType<typeof getFocusGraph>>) =>
      graph.ok ? Object.fromEntries(graph.value.groups.map((g) => [g.label, g.nodes.map((n) => n.label)])) : null;

    // Every group, under its kind's name; the reporting line is a LEAD_OF relation.
    const person = await getFocusGraph(reg, work, { type: 'PERSON', id: lead.id });
    expect(person.ok && person.value.focus?.label).toBe('Focus Lead');
    expect(labelsOf(person)).toEqual({
      'Lead of': ['Focus Report'],
      Family: ['Focus Cousins'],
      Team: ['Focus Team'],
      Owns: ['Focus Project']
    });
    expect(person.ok && person.value.groups.map((g) => g.label).slice(0, 3)).toEqual(['Lead of', 'Family', 'Team']);
    expect(labelsOf(person)?.['Lead of']).not.toContain(gone.name);

    // Attached todos are not neighbours; goal–project links read as dependencies.
    expect(labelsOf(await getFocusGraph(reg, work, { type: 'PROJECT', id: project.id }))).toEqual({
      'Owned by': ['Focus Lead'],
      'Depends on': ['Focus Upstream'],
      'Needed by': ['Focus Goal']
    });
    expect(labelsOf(await getFocusGraph(reg, work, { type: 'GROUP', id: team.id }))).toEqual({ Members: ['Focus Lead'] });

    // One link further: the team's other member, the project's upstream and goal.
    const second = await getFocusGraph(reg, work, { type: 'PERSON', id: lead.id });
    const outer = second.ok ? Object.values(second.value.branches).flatMap((b) => b.nodes.map((n) => n.label)).sort() : null;
    expect(outer).toEqual(['Focus Goal', 'Focus Upstream']);

    // A home notebook leaves goals out of both rings.
    const noGoals = await getFocusGraph(reg, home, { type: 'PROJECT', id: project.id });
    expect(labelsOf(noGoals)).toEqual({ 'Owned by': ['Focus Lead'], 'Depends on': ['Focus Upstream'] });

    const fallback = await getFocusGraph(reg, work);
    expect(fallback.ok && fallback.value.focus).not.toBeNull();

    const missing = await getFocusGraph(reg, work, { type: 'GROUP', id: 'no-such-group' });
    expect(missing.ok).toBe(false);
  });
});
