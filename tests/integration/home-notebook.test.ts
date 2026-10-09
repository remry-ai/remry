// What a home notebook leans on, against the real database: user-defined page
// kinds and their field changes, a kind's pages as a dataset, recurring todos,
// birthdays and personal relations.

import { beforeAll, describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { ensureDatabase } from '../../src/shared/db/bootstrap.server';
import { createPageKind, deletePageKind, listPageKinds, updatePageKind } from '../../src/api/page-kind/operations';
import { createPage, getPage, queryPages, updatePage } from '../../src/api/page/operations';
import { createTodo, listTodosForEntity, updateTodo } from '../../src/api/attached/todo/operations';
import { createPerson, deletePerson, getPerson, listPersons, setMe, updatePerson } from '../../src/api/person/operations';
import { addGroupMember, createGroup } from '../../src/api/group/operations';
import { seedGroupKinds } from '../../src/api/group-kind/operations';
import { createPersonRelationKind, deletePersonRelationKind, listPersonRelationKinds, seedPersonRelationKinds, updatePersonRelationKind } from '../../src/api/person-relation-kind/operations';
import { addPersonRelation } from '../../src/api/person-relation/operations';
import { createCallerFactory } from '../../src/shared/trpc/init';
import { appRouter } from '../../src/shared/trpc/router';
import { createNotebookContext } from '../../src/shared/trpc/context.server';
import { PERSONAL_MODULE } from '../../src/shared/modules/personal';
import { listRelationsForEntity } from '../../src/api/relation/operations';
import { createProject } from '../../src/api/project/operations';
import { OTHER_NOTEBOOK, TEST_NOTEBOOK } from './test-notebooks';

// The empty second notebook, so the kinds and people here start from nothing.
const reg = () => getRegistry(OTHER_NOTEBOOK);

beforeAll(async () => {
  await ensureDatabase(OTHER_NOTEBOOK);
  await seedPersonRelationKinds(reg(), PERSONAL_MODULE.personRelationKinds);
});

const must = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

describe('page kinds as datasets', () => {
  it('kind → pages → query with filters, groups and totals → field changes → delete', async () => {
    const r = reg();
    const bad = await createPageKind(r, { key: 'expense', name: 'Expense' });
    expect(!bad.ok && bad.error.message).toContain("can't be a kind key");

    must(await createPageKind(r, {
      key: 'EXPENSE',
      name: 'Expense',
      fields: [
        { key: 'amount', label: 'Amount', input: 'number', format: 'money', currency: 'USD' },
        { key: 'frequency', label: 'Frequency', input: 'select', options: ['MONTHLY', 'YEARLY'] },
        { key: 'category', label: 'Category', input: 'select', options: ['Home', 'Fun', 'Car'] },
        { key: 'autopay', label: 'Autopay', input: 'checkbox' }
      ]
    }));
    expect((await createPageKind(r, { key: 'BILL', name: 'expense' })).ok).toBe(false);

    const unknown = await createPage(r, { title: 'x', kind: 'RECIPE' });
    expect(!unknown.ok && unknown.error.message).toContain('Kinds: GENERAL, EXPENSE');

    const rent = must(await createPage(r, { title: 'Rent', kind: 'EXPENSE', properties: { amount: 1500, frequency: 'MONTHLY', category: 'Home', autopay: true } }));
    must(await createPage(r, { title: 'Netflix', kind: 'EXPENSE', properties: { amount: 15.5, frequency: 'MONTHLY', category: 'Fun' } }));
    must(await createPage(r, { title: 'Car insurance', kind: 'EXPENSE', properties: { amount: 900, frequency: 'YEARLY', category: 'Car' } }));

    const monthly = must(await queryPages(r, { kind: 'EXPENSE', filters: ['frequency:is:MONTHLY'], sort: 'amount:asc', aggregates: ['amount:sum'] }));
    expect(monthly.pages.map((p) => p.title)).toEqual(['Netflix', 'Rent']);
    expect(monthly.totals).toEqual({ 'amount:sum': 1515.5 });

    const grouped = must(await queryPages(r, { kind: 'EXPENSE', groupBy: 'frequency', aggregates: ['amount:max'] }));
    expect(grouped.groups?.map((g) => [g.value, g.count, g.totals['amount:max']])).toEqual([['MONTHLY', 2, 1500], ['YEARLY', 1, 900]]);
    const badQuery = await queryPages(r, { kind: 'EXPENSE', filters: ['colour:is:red'] });
    expect(!badQuery.ok && badQuery.error.message).toContain('there is no field "colour"');

    const dropOption = await updatePageKind(r, 'EXPENSE', {
      fields: [
        { key: 'amount', label: 'Amount', input: 'number', format: 'money', currency: 'USD' },
        { key: 'frequency', label: 'Frequency', input: 'select', options: ['MONTHLY'] },
        { key: 'category', label: 'Category', input: 'select', options: ['Home', 'Fun', 'Car'] },
        { key: 'autopay', label: 'Autopay', input: 'checkbox' }
      ]
    });
    expect(!dropOption.ok && dropOption.error.message).toContain('"Car insurance"');

    const dropField = must(await updatePageKind(r, 'EXPENSE', {
      fields: [
        { key: 'amount', label: 'Amount', input: 'number', format: 'money', currency: 'USD' },
        { key: 'frequency', label: 'Frequency', input: 'select', options: ['MONTHLY', 'YEARLY', 'QUARTERLY'] },
        { key: 'category', label: 'Categories', input: 'multiselect', options: ['Home', 'Fun', 'Car'] }
      ]
    }));
    expect(dropField.removedFields).toEqual(['autopay']);
    expect(must(await getPage(r, rent.id)).properties).toEqual({ amount: 1500, frequency: 'MONTHLY', category: ['Home'] });
    expect((await updatePage(r, rent.id, { properties: { category: ['Home', 'Fun'] } })).ok).toBe(true);

    const refused = await deletePageKind(r, 'EXPENSE');
    expect(!refused.ok && refused.error.message).toContain('3 page(s) are EXPENSE');
    expect(must(await deletePageKind(r, 'EXPENSE', 'GENERAL')).pagesMoved).toBe(3);
    expect(must(await getPage(r, rent.id))).toMatchObject({ kind: 'GENERAL', properties: {} });
    expect(must(await listPageKinds(r)).map((k) => k.key)).toEqual(['GENERAL']);
  });
});

describe('recurring todos', () => {
  it('completing one adds the next, due one interval later, and moves the recurrence to it', async () => {
    const r = reg();
    const project = must(await createProject(r, { name: 'Car' }));
    const todo = must(await createTodo(r, {
      title: 'Renew car insurance', entityType: 'PROJECT', entityId: project.id,
      targetDate: new Date('2026-03-01T00:00:00Z'), recurrence: 'YEARLY'
    }));
    const done = must(await updateTodo(r, todo.id, { status: 'COMPLETE' }));
    expect(done.nextId).toBeDefined();

    const todos = await listTodosForEntity(r, 'PROJECT', project.id);
    const next = todos.find((t) => t.id === done.nextId);
    expect(next).toMatchObject({ title: 'Renew car insurance', status: 'PENDING', recurrence: 'YEARLY' });
    expect(next?.targetDate?.toISOString().slice(0, 10)).toBe('2027-03-01');
    expect(todos.find((t) => t.id === todo.id)).toMatchObject({ status: 'COMPLETE', recurrence: null });
  });
});

describe('people at home', () => {
  it('keeps birthdays and relationships between people, one row per symmetric pair', async () => {
    const r = reg();
    const sam = must(await createPerson(r, { name: 'Sam', extensions: { personal: { birthday: '--05-03', knownAs: 'Sister' } } }));
    const alex = must(await createPerson(r, { name: 'Alex', extensions: { personal: { birthday: '1990-01-31' } } }));
    expect(must(await getPerson(r, sam.id)).extensions.personal).toEqual({ birthday: '--05-03', knownAs: 'Sister' });

    must(await addPersonRelation(r, { fromId: sam.id, toId: alex.id, kind: 'SIBLING_OF' }));
    const again = await addPersonRelation(r, { fromId: alex.id, toId: sam.id, kind: 'SIBLING_OF' });
    expect(!again.ok && again.error.message).toContain('already sibling of');
    must(await addPersonRelation(r, { fromId: sam.id, toId: alex.id, kind: 'PARENT_OF' }));

    const fromAlex = must(await listRelationsForEntity(r, 'PERSON', alex.id));
    expect(fromAlex.map((g) => g.label)).toEqual(['Child of', 'Sibling of']);
    expect(fromAlex.every((g) => g.items.every((i) => i.personRelation))).toBe(true);

    expect((await addPersonRelation(r, { fromId: sam.id, toId: sam.id, kind: 'FRIEND_OF' })).ok).toBe(false);
    const unknown = await addPersonRelation(r, { fromId: sam.id, toId: alex.id, kind: 'NEMESIS_OF' });
    expect(!unknown.ok && unknown.error.message).toContain('personRelationKind.create');
  });

  it('deletes a person\'s relationships with them, in the database', async () => {
    const r = reg();
    const [a, b] = await Promise.all(['Gone A', 'Gone B'].map(async (name) => must(await createPerson(r, { name }))));
    const rel = must(await addPersonRelation(r, { fromId: a!.id, toId: b!.id, kind: 'FRIEND_OF' }));
    must(await deletePerson(r, a!.id));
    expect(await r.prisma.personRelation.findUnique({ where: { id: rel.id } })).toBeNull();
  });

  it('reads relationships from the other person toward "me", and keeps one me', async () => {
    const r = reg();
    const me = must(await createPerson(r, { name: 'Me Myself' }));
    const mom = must(await createPerson(r, { name: 'Me Mom' }));
    const kid = must(await createPerson(r, { name: 'Me Kid' }));
    must(await addPersonRelation(r, { fromId: mom.id, toId: me.id, kind: 'PARENT_OF' }));
    must(await addPersonRelation(r, { fromId: me.id, toId: kid.id, kind: 'PARENT_OF' }));

    must(await setMe(r, mom.id));
    must(await setMe(r, me.id));
    const people = must(await listPersons(r));
    expect(people.filter((p) => p.isMe).map((p) => p.name)).toEqual(['Me Myself']);
    expect(people.find((p) => p.id === mom.id)?.toMe).toEqual(['Parent of']);
    expect(people.find((p) => p.id === kid.id)?.toMe).toEqual(['Child of']);
    expect(must(await getPerson(r, kid.id)).toMe).toEqual(['Child of']);
    expect(must(await getPerson(r, me.id)).toMe).toEqual([]);

    must(await setMe(r, null));
    expect(must(await listPersons(r)).some((p) => p.isMe)).toBe(false);
    expect((await setMe(r, 'no-such-person')).ok).toBe(false);
  });
});

describe('one-each person relation kinds', () => {
  it('gives a person one lead: a new LEAD_OF replaces the old one and says so', async () => {
    const r = getRegistry(TEST_NOTEBOOK);
    const [a, b, c] = await Promise.all(['Ex Lead A', 'Ex Lead B', 'Ex Report'].map(async (name) => must(await createPerson(r, { name }))));
    const first = must(await addPersonRelation(r, { fromId: a!.id, toId: c!.id, kind: 'LEAD_OF' }));
    expect(first.replaced).toBeNull();
    const second = must(await addPersonRelation(r, { fromId: b!.id, toId: c!.id, kind: 'LEAD_OF' }));
    expect(second.replaced).toEqual({ id: first.id, personId: a!.id, name: 'Ex Lead A' });
    const leads = must(await listRelationsForEntity(r, 'PERSON', c!.id)).find((g) => g.label === 'Reports to');
    expect(leads?.items.map((i) => i.other.label)).toEqual(['Ex Lead B']);
    expect(must(await getPerson(r, c!.id)).extensions.org).toMatchObject({ leadId: b!.id, leadName: 'Ex Lead B' });
    // A lead can have any number of reports.
    must(await addPersonRelation(r, { fromId: b!.id, toId: a!.id, kind: 'LEAD_OF' }));
    expect(must(await getPerson(r, b!.id)).extensions.org?.reports.map((p) => p.name).sort()).toEqual(['Ex Lead A', 'Ex Report']);

    // The reporting line is a tree: B leads A and C, so neither can lead B.
    const loop = await addPersonRelation(r, { fromId: c!.id, toId: b!.id, kind: 'LEAD_OF' });
    expect(!loop.ok && loop.error.message).toContain('loop');
    const viaExtension = await updatePerson(r, b!.id, { extensions: { org: { leadId: a!.id } } });
    expect(!viaExtension.ok && viaExtension.error.message).toContain('loop');

    // The database refuses a second lead written around the app (a trigger; the
    // libsql adapter reports every constraint failure as a foreign key one).
    await expect(r.prisma.personRelation.create({ data: { fromPersonId: a!.id, toPersonId: c!.id, kind: 'LEAD_OF' } })).rejects.toThrow();
  });
});

describe('groups and modules', () => {
  it('keeps a person in groups of several kinds, and one group of an exclusive kind', async () => {
    const r = reg();
    await seedGroupKinds(r, [...PERSONAL_MODULE.groupKinds, { key: 'HOUSE', name: 'House', plural: 'Houses', exclusive: true }]);
    const kim = must(await createPerson(r, { name: 'Kim' }));
    const family = must(await createGroup(r, { kind: 'FAMILY', name: 'Parks' }));
    const friends = must(await createGroup(r, { kind: 'FRIENDS', name: 'Climbing crew' }));
    const flat = must(await createGroup(r, { kind: 'HOUSE', name: 'Flat on Elm St' }));
    const house = must(await createGroup(r, { kind: 'HOUSE', name: 'House on Oak Ave' }));
    for (const g of [family, friends, flat]) must(await addGroupMember(r, g.id, kim.id));

    const moved = must(await addGroupMember(r, house.id, kim.id));
    expect(moved.replaced).toEqual(['Flat on Elm St']);
    expect(must(await getPerson(r, kim.id)).groups.map((g) => [g.kindName, g.name])).toEqual([
      ['Family', 'Parks'],
      ['Friends', 'Climbing crew'],
      ['House', 'House on Oak Ave']
    ]);
  });

  it('refuses what a notebook\'s modules don\'t include', async () => {
    const caller = async (profile: 'home' | 'work') =>
      createCallerFactory(appRouter)(await createNotebookContext({ id: OTHER_NOTEBOOK, name: 'Other', profile, createdAt: '' }));
    const home = await caller('home');
    await expect(home.goal.create({ title: 'Run a marathon' })).rejects.toThrow(/Goals module/);
    const orgPatch = await home.person.create({ name: 'Lee', extensions: { org: { title: 'CTO' } } });
    expect(!orgPatch.ok && orgPatch.error.message).toContain('Org chart module');
    const work = await caller('work');
    expect((await work.goal.list({})).ok).toBe(true);
  });
});

describe('person relation kinds as data', () => {
  it('creates, renames and deletes a kind, moving its relationships first', async () => {
    const r = reg();
    const mentor = must(await createPersonRelationKind(r, { key: 'MENTOR_OF', label: 'Mentor of', inverseLabel: 'Mentee of' }));
    expect(mentor).toMatchObject({ symmetric: false, exclusive: false });
    const neighbour = must(await createPersonRelationKind(r, { key: 'NEIGHBOUR_OF', label: 'Neighbour of' }));
    expect(neighbour).toMatchObject({ symmetric: true, inverseLabel: 'Neighbour of' });
    expect((await createPersonRelationKind(r, { key: 'MENTOR_OF', label: 'x' })).ok).toBe(false);
    expect((await createPersonRelationKind(r, { key: 'bad key', label: 'x' })).ok).toBe(false);
    expect((await createPersonRelationKind(r, { key: 'TWIN_OF', label: 'Twin of', exclusive: true })).ok).toBe(false);

    must(await updatePersonRelationKind(r, 'MENTOR_OF', { inverseLabel: 'Mentored by' }));
    const [a, b] = await Promise.all(['Kind A', 'Kind B'].map(async (name) => must(await createPerson(r, { name }))));
    must(await addPersonRelation(r, { fromId: b!.id, toId: a!.id, kind: 'MENTOR_OF' }));
    must(await addPersonRelation(r, { fromId: a!.id, toId: b!.id, kind: 'MENTOR_OF' }));
    expect(must(await listRelationsForEntity(r, 'PERSON', b!.id)).map((g) => g.label)).toContain('Mentored by');

    expect((await deletePersonRelationKind(r, 'MENTOR_OF')).ok).toBe(false);
    // Into a symmetric kind, the two directions are one pair: one moves, one goes.
    expect(must(await deletePersonRelationKind(r, 'MENTOR_OF', 'NEIGHBOUR_OF'))).toMatchObject({ relationsMoved: 1, relationsDropped: 1 });
    expect(must(await listPersonRelationKinds(r)).some((k) => k.key === 'MENTOR_OF')).toBe(false);
    expect(must(await listRelationsForEntity(r, 'PERSON', b!.id)).map((g) => g.label)).toContain('Neighbour of');
  });
});
