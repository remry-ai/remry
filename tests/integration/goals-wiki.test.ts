// Goals, wiki pages and relations against the real database: owners, the goal
// cascade, check-ins, page properties, mentions from content, and the cleanup
// a delete does.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { createDepartment, createTeam } from './org-helpers';
import { createProject, getProject, listProjects, updateProject } from '../../src/api/project/operations';
import { addCheckIn, addGoalProject, createGoal, getGoal, listGoals, updateGoal } from '../../src/api/goal/operations';
import { createPage, deletePage, getPage, updatePage } from '../../src/api/page/operations';
import { addDoc, getDoc, updateDoc } from '../../src/api/attached/doc/operations';
import { addNote, listNotes } from '../../src/api/attached/note/operations';
import { addRelation, listRelationsForEntity } from '../../src/api/relation/operations';
import { TEST_NOTEBOOK } from './test-notebooks';

describe('goals', () => {
  it('project owner → goal cascade → check-ins → project link', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const dept = await createDepartment(reg, { name: 'Engineering' });
    const team = await createTeam(reg, { name: 'Payments' });
    if (!dept.ok || !team.ok) throw new Error('setup failed');

    const project = await createProject(reg, { name: 'Checkout v2', ownerType: 'PERSON', ownerId: 'person_alice' });
    expect(project.ok).toBe(true);
    if (!project.ok) return;
    const detail = await getProject(reg, project.value.id);
    expect(detail.ok && detail.value.owner).toEqual({ type: 'PERSON', id: 'person_alice', label: 'Alice Johnson', path: '/app/people/person_alice' });
    const owned = await listProjects(reg, { ownerType: 'PERSON', ownerId: 'person_alice' });
    expect(owned.ok && owned.value.map((p) => p.name)).toEqual(['Checkout v2']);
    expect((await updateProject(reg, project.value.id, { ownerType: 'GROUP', ownerId: 'no_such_team' })).ok).toBe(false);

    const parent = await createGoal(reg, {
      title: 'Grow revenue 20%', ownerType: 'GROUP', ownerId: dept.value.id, period: '2026-H2', unit: '%', baseline: 0, target: 20
    });
    const child = await createGoal(reg, {
      title: 'Checkout conversion to 4%', ownerType: 'GROUP', ownerId: team.value.id, parentId: parent.ok ? parent.value.id : undefined, unit: '%', baseline: 2, target: 4
    });
    if (!parent.ok || !child.ok) throw new Error('goal create failed');
    expect(child.value.path).toBe(`/app/goals/${child.value.id}`);

    const loop = await updateGoal(reg, parent.value.id, { parentId: child.value.id });
    expect(!loop.ok && loop.error.message).toContain("can't be its parent");

    expect((await addCheckIn(reg, { goalId: child.value.id, date: new Date('2026-07-01'), value: 2.5 })).ok).toBe(true);
    expect((await addCheckIn(reg, { goalId: child.value.id, date: new Date('2026-08-01'), value: 3, status: 'AT_RISK', comment: 'Redesign slipped' })).ok).toBe(true);
    expect((await addCheckIn(reg, { goalId: child.value.id })).ok).toBe(false);

    expect((await addGoalProject(reg, child.value.id, project.value.id)).ok).toBe(true);
    expect((await addGoalProject(reg, child.value.id, project.value.id)).ok).toBe(true);

    const goal = await getGoal(reg, child.value.id);
    expect(goal.ok).toBe(true);
    if (!goal.ok) return;
    expect(goal.value).toMatchObject({ current: 3, progress: 0.5, status: 'AT_RISK', parent: { title: 'Grow revenue 20%' } });
    expect(goal.value.owner?.label).toBe('Payments');
    expect(goal.value.checkIns.map((c) => c.value)).toEqual([3, 2.5]);
    expect(goal.value.projects.map((p) => p.name)).toEqual(['Checkout v2']);

    const forProject = await listGoals(reg, { projectId: project.value.id });
    expect(forProject.ok && forProject.value.map((g) => g.title)).toEqual(['Checkout conversion to 4%']);
    const topLevel = await listGoals(reg, { parentId: null });
    expect(topLevel.ok && topLevel.value.map((g) => g.title)).toEqual(['Grow revenue 20%']);
  });
});

describe('wiki pages and relations', () => {
  it('properties → mentions from content → typed relation → cleanup on delete', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);

    const bad = await createPage(reg, { title: 'Bad', kind: 'SOFTWARE', properties: { seats: 'ten' } });
    expect(!bad.ok && bad.error.message).toContain('seats');

    const page = await createPage(reg, { title: 'Stripe', kind: 'SOFTWARE', properties: { vendor: 'Stripe', annualCost: 12000 } });
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect((await updatePage(reg, page.value.id, { properties: { seats: 5, annualCost: null } })).ok).toBe(true);
    const detail = await getPage(reg, page.value.id);
    expect(detail.ok && detail.value.properties).toEqual({ vendor: 'Stripe', seats: 5 });

    const doc = await addDoc(reg, 'PERSON', 'person_bob', { title: 'Payments notes' });
    if (!doc.ok) throw new Error('doc create failed');
    await updateDoc(reg, doc.value.id, { content: `We take cards through [Stripe](${page.value.path}).` });

    const mentioned = await listRelationsForEntity(reg, 'PAGE', page.value.id);
    expect(mentioned.ok && mentioned.value.map((g) => [g.label, g.items.map((i) => [i.other.label, i.other.path])])).toEqual([
      ['Mentioned in', [['Payments notes', `/app/people/person_bob?doc=${doc.value.id}`]]]
    ]);

    await updatePage(reg, page.value.id, { title: 'Stripe Billing' });
    const afterRename = await listRelationsForEntity(reg, 'PAGE', page.value.id);
    expect(afterRename.ok && afterRename.value.flatMap((g) => g.items)).toHaveLength(1);

    await updateDoc(reg, doc.value.id, { content: 'No links any more.' });
    const unlinked = await listRelationsForEntity(reg, 'PAGE', page.value.id);
    expect(unlinked.ok && unlinked.value).toEqual([]);

    const team = await createTeam(reg, { name: 'Billing' });
    if (!team.ok) throw new Error('team create failed');
    const related = await addRelation(reg, { fromType: 'GROUP', fromId: team.value.id, toType: 'PAGE', toId: page.value.id, kind: 'RELATED', note: 'Card payments' });
    expect(related.ok).toBe(true);
    const teamRelations = await listRelationsForEntity(reg, 'GROUP', team.value.id);
    expect(teamRelations.ok && teamRelations.value.map((g) => [g.label, g.items.map((i) => [i.other.label, i.note])])).toEqual([
      ['Related to', [['Stripe Billing', 'Card payments']]]
    ]);
    // RELATED has no direction, so the reverse is the same link.
    const duplicate = await addRelation(reg, { fromType: 'PAGE', fromId: page.value.id, toType: 'GROUP', toId: team.value.id, kind: 'RELATED' });
    expect(!duplicate.ok && duplicate.error.message).toContain('relation.update');

    await addNote(reg, 'PAGE', page.value.id, { content: 'Contract renews in January' });
    expect((await deletePage(reg, page.value.id)).ok).toBe(true);

    const notes = await listNotes(reg, 'PAGE', page.value.id);
    expect(notes.ok && notes.value).toEqual([]);
    const left = await reg.prisma.relation.count({
      where: { OR: [{ fromType: 'PAGE', fromId: page.value.id }, { toType: 'PAGE', toId: page.value.id }] }
    });
    expect(left).toBe(0);
  });
});

describe('docs', () => {
  it('get returns the doc with the entity it belongs to (the print page)', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const doc = await addDoc(reg, 'PERSON', 'person_bob', { title: 'Export me' });
    if (!doc.ok) throw new Error('doc create failed');
    await updateDoc(reg, doc.value.id, { content: '# Hello' });

    const detail = await getDoc(reg, doc.value.id);
    expect(detail.ok && { title: detail.value.title, content: detail.value.content, entityName: detail.value.entityName, entityPath: detail.value.entityPath }).toEqual({
      title: 'Export me',
      content: '# Hello',
      entityName: 'Bob Smith',
      entityPath: '/app/people/person_bob'
    });
    expect((await getDoc(reg, 'doc_missing')).ok).toBe(false);
  });
});
