// Archived entities stay out of every read that reaches them through a relation: a lead and
// reports, group members and a person's groups, sub-projects, sub-goals, sub-pages, a goal's
// projects, the Related list, counts, the org map and the home graph. The test links one
// archived entity of each type (and a doc on an archived project) to active ones, archives
// them, then reads everything around the active ones and fails if an archived id shows up
// anywhere in the output. A new read that forgets `ACTIVE` (src/api/_archive.ts) fails here
// once it's added to `reads`.

import { describe, it, expect } from 'vitest';
import { appRouter } from '../../src/shared/trpc/router';
import { createCallerFactory } from '../../src/shared/trpc/init';
import { createNotebookContext } from '../../src/shared/trpc/context.server';
import { resolveCurrentNotebook } from '../../src/shared/notebooks/current.server';
import { getRegistry } from '../../src/shared/registry.server';
import { listGroupsWithMembers } from '../../src/api/group/operations';
import { TEST_NOTEBOOK } from './test-notebooks';

const caller = async () => {
  const notebook = await resolveCurrentNotebook({ explicit: TEST_NOTEBOOK });
  if (!notebook.ok) throw notebook.error;
  return createCallerFactory(appRouter)(await createNotebookContext(notebook.value));
};

interface Outcome<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: unknown;
}

const value = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok || outcome.value === undefined) throw new Error(`setup failed: ${JSON.stringify(outcome.error)}`);
  return outcome.value;
};

describe('archived entities', () => {
  it('never show up through a relation of an active one', async () => {
    const api = await caller();

    // Active entities, each linked to an archived one of every type.
    const ada = value(await api.person.create({ name: 'Ada Active' }));
    const team = value(await api.group.create({ kind: 'TEAM', name: 'Active team' }));
    const project = value(await api.project.create({ name: 'Active project' }));
    const goal = value(await api.goal.create({ title: 'Active goal' }));
    const page = value(await api.page.create({ title: 'Active page' }));

    const formerLead = value(await api.person.create({ name: 'Former lead' }));
    const formerReport = value(await api.person.create({ name: 'Former report' }));
    const oldTeam = value(await api.group.create({ kind: 'TEAM', name: 'Old team' }));
    const oldProject = value(await api.project.create({ name: 'Old sub-project', parentId: project.id }));
    const oldGoal = value(await api.goal.create({ title: 'Old sub-goal', parentId: goal.id }));
    const oldPage = value(await api.page.create({ title: 'Old sub-page', parentId: page.id }));
    const oldDoc = value(await api.doc.add({ entityType: 'PROJECT', entityId: oldProject.id, title: 'Old project doc' }));

    value(await api.personRelation.add({ fromId: formerLead.id, toId: ada.id, kind: 'LEAD_OF' }));
    value(await api.personRelation.add({ fromId: ada.id, toId: formerReport.id, kind: 'LEAD_OF' }));
    value(await api.group.addMember({ groupId: team.id, personId: ada.id }));
    value(await api.group.addMember({ groupId: team.id, personId: formerReport.id }));
    value(await api.group.addMember({ groupId: oldTeam.id, personId: ada.id }));
    value(await api.goal.addProject({ goalId: goal.id, projectId: oldProject.id }));
    value(await api.goal.addProject({ goalId: oldGoal.id, projectId: project.id }));
    for (const [toType, toId] of [['PERSON', formerReport.id], ['GROUP', oldTeam.id], ['PAGE', oldPage.id], ['DOC', oldDoc.id]] as const) {
      value(await api.relation.add({ fromType: 'PROJECT', fromId: project.id, toType, toId }));
    }
    value(await api.relation.add({ fromType: 'PAGE', fromId: page.id, toType: 'PROJECT', toId: oldProject.id }));

    const archivedRefs = [
      ['PERSON', formerLead.id], ['PERSON', formerReport.id], ['GROUP', oldTeam.id],
      ['PROJECT', oldProject.id], ['GOAL', oldGoal.id], ['PAGE', oldPage.id]
    ] as const;
    for (const [entityType, id] of archivedRefs) value(await api.entity.archive({ entityType, id }));
    const hidden = [...archivedRefs.map(([, id]) => id), oldDoc.id];

    const reads: Readonly<Record<string, () => Promise<unknown>>> = {
      'person.get': () => api.person.get({ id: ada.id }),
      'person.list': () => api.person.list({}),
      'personRelation.forPerson': () => api.personRelation.forPerson({ personId: ada.id }),
      'group.get': () => api.group.get({ id: team.id }),
      'group.listMembers': () => api.group.listMembers({ groupId: team.id }),
      'group.list': () => api.group.list({}),
      'project.get': () => api.project.get({ id: project.id }),
      'project.list': () => api.project.list({}),
      'goal.get': () => api.goal.get({ id: goal.id }),
      'goal.list': () => api.goal.list({}),
      'page.get': () => api.page.get({ id: page.id }),
      'page.list': () => api.page.list({}),
      'org map teams': () => listGroupsWithMembers(getRegistry(TEST_NOTEBOOK), { kind: 'TEAM' }),
      'home.graph': () => api.home.graph({ focusType: 'PERSON', focusId: ada.id }),
      ...Object.fromEntries((['PERSON', 'GROUP', 'PROJECT', 'GOAL', 'PAGE'] as const).map((entityType) => {
        const entityId = { PERSON: ada.id, GROUP: team.id, PROJECT: project.id, GOAL: goal.id, PAGE: page.id }[entityType];
        return [`relation.forEntity ${entityType}`, () => api.relation.forEntity({ entityType, entityId })];
      }))
    };

    const leaks: string[] = [];
    for (const [name, read] of Object.entries(reads)) {
      const output = JSON.stringify(await read());
      expect(output, `${name} failed`).toContain('"ok":true');
      for (const id of hidden) if (output.includes(id)) leaks.push(`${name} returns ${id}`);
    }
    expect(leaks).toEqual([]);

    // Counts leave them out too.
    const groups = value(await api.group.list({}));
    expect(groups.find((g) => g.id === team.id)?.memberCount).toBe(1);
    const projects = value(await api.project.list({}));
    expect(projects.find((p) => p.id === project.id)?.childCount).toBe(0);
  });
});
