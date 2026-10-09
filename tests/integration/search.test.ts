// Full-text search and recall against the real database: the triggers keep the
// index in step with creates, updates and deletes; archived entities are hidden;
// recall finds text that names an entity without linking it.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { createPerson, deletePerson, updatePerson } from '../../src/api/person/operations';
import { createTeam } from './org-helpers';
import { addCheckIn, createGoal } from '../../src/api/goal/operations';
import { createPage } from '../../src/api/page/operations';
import { addDoc, updateDoc } from '../../src/api/attached/doc/operations';
import { addNote } from '../../src/api/attached/note/operations';
import { addComment } from '../../src/api/attached/comment/operations';
import { addLink } from '../../src/api/attached/link/operations';
import { createTodo } from '../../src/api/attached/todo/operations';
import { attachTag, createTag } from '../../src/api/attached/tag/operations';
import { setArchived } from '../../src/api/_archive';
import { searchNotebook, type SearchInput } from '../../src/api/search/operations';
import { recallEntity } from '../../src/api/search/recall';
import { TEST_NOTEBOOK } from './test-notebooks';

const reg = getRegistry(TEST_NOTEBOOK);

const search = async (q: string, extra: Omit<SearchInput, 'q'> = {}) => {
  const result = await searchNotebook(reg, { q, ...extra });
  if (!result.ok) throw result.error;
  return result.value.results;
};
const ids = async (q: string, extra: Omit<SearchInput, 'q'> = {}) => (await search(q, extra)).map((r) => r.entityId);

describe('search index triggers', () => {
  it('has a trigger for every write to every indexed table', async () => {
    const rows = await reg.prisma.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name GLOB 'search_*' ORDER BY name"
    );
    const tables = ['comment', 'doc', 'goal', 'goal_check_in', 'group', 'link', 'note', 'org_person', 'page', 'person', 'personal_person', 'project', 'report', 'todo'];
    expect(rows.map((r) => r.name)).toEqual(tables.flatMap((t) => ['ad', 'ai', 'au'].map((e) => `search_${t}_${e}`)).sort());
  });

  it('indexes rows created before or around the index, including the seeded people', async () => {
    expect(await ids('alice')).toContain('person_alice');
    expect(await ids('bob@example')).toContain('person_bob');
  });
});

describe('search.query', () => {
  it('finds every kind of text, with stemming and prefixes', async () => {
    const team = await createTeam(reg, { name: 'Platform', description: 'Runs the build farm' });
    const page = await createPage(reg, { title: 'Datadog', kind: 'SOFTWARE', content: 'Our monitoring tool.', properties: { vendor: 'Datadog Inc', seats: 40 } });
    const goal = await createGoal(reg, { title: 'Ship faster' });
    if (!team.ok || !page.ok || !goal.ok) throw new Error('setup failed');

    const note = await addNote(reg, 'PERSON', 'person_alice', { content: 'Worried about people leaving the platform team' });
    const doc = await addDoc(reg, 'GROUP', team.value.id, { title: 'Onboarding guide' });
    if (!note.ok || !doc.ok) throw new Error('setup failed');
    await updateDoc(reg, doc.value.id, { content: '# Setup\nInstall the toolchain and request VPN access.' });
    const todo = await createTodo(reg, { title: 'Renew the vendor contract', description: 'Before the quarterly review', entityType: 'PAGE', entityId: page.value.id });
    const comment = await addComment(reg, 'GROUP', team.value.id, { content: 'Consider a hackathon in spring' });
    const link = await addLink(reg, 'GROUP', team.value.id, { url: 'https://linear.app/acme/issue/ENG-123', title: 'Flaky build' });
    const checkIn = await addCheckIn(reg, { goalId: goal.value.id, value: 1, comment: 'Deploy pipeline is the bottleneck' });
    if (!todo.ok || !comment.ok || !link.ok || !checkIn.ok) throw new Error('setup failed');

    const [noteHit] = await search('leave');
    expect(noteHit).toMatchObject({
      entityType: 'NOTE',
      entityId: note.value.id,
      path: '/app/people/person_alice',
      on: { entityType: 'PERSON', entityId: 'person_alice', name: 'Alice Johnson' }
    });
    expect(noteHit?.snippet).toContain('**leaving**');

    expect(await ids('build farm')).toContain(team.value.id);
    expect(await ids('inc')).toEqual([page.value.id]); // property values, not keys
    expect(await ids('seats')).toEqual([]);
    expect(await ids('toolchain')).toEqual([doc.value.id]);
    expect((await search('toolchain'))[0]?.path).toBe(`/app/groups/${team.value.id}?doc=${doc.value.id}`);
    expect(await ids('quarterly')).toEqual([todo.value.id]);
    expect(await ids('hackath')).toEqual([comment.value.id]);
    expect(await ids('ENG-123')).toEqual([link.value.id]);
    const [checkInHit] = await search('bottleneck');
    expect(checkInHit).toMatchObject({ entityType: 'GOAL_CHECKIN', path: `/app/goals/${goal.value.id}`, on: { name: 'Ship faster' } });
  });

  it('ranks a title match above a passing mention', async () => {
    const page = await createPage(reg, { title: 'Kubernetes upgrade' });
    await addNote(reg, 'PERSON', 'person_bob', { content: 'Bob asked about the kubernetes plan, among many other things we discussed today at length' });
    if (!page.ok) throw new Error('setup failed');
    expect((await ids('kubernetes'))[0]).toBe(page.value.id);
  });

  it('supports phrases, OR and exclusions, and filters by type', async () => {
    await addNote(reg, 'PERSON', 'person_carol', { content: 'Carol owns the billing service' });
    await addNote(reg, 'PERSON', 'person_carol', { content: 'The service for billing is slow' });
    expect(await search('"billing service"')).toHaveLength(1);
    expect(await search('billing service')).toHaveLength(2);
    expect(await search('billing -slow')).toHaveLength(1);
    expect(await search('zzznothing OR billing')).toHaveLength(2);
    expect(await search('billing', { types: ['PERSON'] })).toHaveLength(0);
    expect((await searchNotebook(reg, { q: '-slow' })).ok).toBe(false);
  });

  it('scopes to one entity and what is attached to it', async () => {
    await addNote(reg, 'PERSON', 'person_bob', { content: 'Bob is learning Rust' });
    await addNote(reg, 'PERSON', 'person_carol', { content: 'Carol teaches Rust' });
    const within = await search('rust', { within: { entityType: 'PERSON', entityId: 'person_bob' } });
    expect(within.map((h) => h.on?.entityId)).toEqual(['person_bob']);
  });

  it('re-indexes an update and forgets a delete, including what the delete cleaned up', async () => {
    const person = await createPerson(reg, { name: 'Dmitri Ivanov', extensions: { org: { title: 'Designer' } } });
    if (!person.ok) throw new Error('setup failed');
    await addNote(reg, 'PERSON', person.value.id, { content: 'Dmitri sketches wireframes' });
    expect(await ids('designer')).toContain(person.value.id);

    await updatePerson(reg, person.value.id, { extensions: { org: { title: 'Researcher' } } });
    expect(await ids('designer')).not.toContain(person.value.id);
    expect(await ids('researcher')).toContain(person.value.id);

    expect((await deletePerson(reg, person.value.id)).ok).toBe(true);
    expect(await search('dmitri')).toHaveLength(0);
    expect(await search('wireframes')).toHaveLength(0);
  });

  it('hides archived entities and their attachments unless asked', async () => {
    const team = await createTeam(reg, { name: 'Legacy Ops' });
    if (!team.ok) throw new Error('setup failed');
    await addNote(reg, 'GROUP', team.value.id, { content: 'Mainframe decommission plan' });
    await setArchived(reg, 'GROUP', team.value.id, true);

    expect(await search('legacy')).toHaveLength(0);
    expect(await search('mainframe')).toHaveLength(0);
    expect(await search('mainframe', { includeArchived: true })).toHaveLength(1);
    expect(await search('mainframe', { within: { entityType: 'GROUP', entityId: team.value.id } })).toHaveLength(1);
  });
});

describe('search.recall', () => {
  it('gathers an entity and finds mentions that do not link to it', async () => {
    const person = await createPerson(reg, { name: 'Priya Nair', extensions: { org: { title: 'Staff Engineer' } } });
    const team = await createTeam(reg, { name: 'Payments Core' });
    if (!person.ok || !team.ok) throw new Error('setup failed');
    const id = person.value.id;

    await addNote(reg, 'PERSON', id, { content: 'Priya Nair wants to lead the migration' });
    await createTodo(reg, { title: 'Book 1:1', entityType: 'PERSON', entityId: id, priority: 2 });
    const doc = await addDoc(reg, 'PERSON', id, { title: 'Growth plan' });
    if (!doc.ok) throw new Error('setup failed');
    await updateDoc(reg, doc.value.id, { content: 'word '.repeat(200) });
    const tag = await createTag(reg, { name: 'high-potential' });
    if (tag.ok) await attachTag(reg, tag.value.id, 'PERSON', id);
    await createGoal(reg, { title: 'Mentor two engineers', ownerType: 'PERSON', ownerId: id });

    const unlinked = await addNote(reg, 'GROUP', team.value.id, { content: 'Ask Priya Nair about the ledger design' });
    const linked = await addNote(reg, 'GROUP', team.value.id, { content: `[Priya Nair](/app/people/${id}) reviewed the ledger` });
    if (!unlinked.ok || !linked.ok) throw new Error('setup failed');

    const result = await recallEntity(reg, 'PERSON', id);
    if (!result.ok) throw result.error;
    const recall = result.value;
    expect(recall).toMatchObject({ name: 'Priya Nair', path: `/app/people/${id}`, archived: false, tags: ['high-potential'] });
    expect(recall.entity).toMatchObject({ id, extensions: { org: { title: 'Staff Engineer' } } });
    expect(recall.notes.items.map((n) => n.content)).toEqual(['Priya Nair wants to lead the migration']);
    expect(recall.todos.items.map((t) => t.title)).toEqual(['Book 1:1']);
    expect(recall.docs.items[0]?.excerpt.length).toBeLessThanOrEqual(301);
    expect(recall.ownedGoals.items.map((g) => g.title)).toEqual(['Mentor two engineers']);
    expect(recall.relations.flatMap((g) => g.items.map((i) => i.other.entityId))).toContain(linked.value.id);
    // Only the note that names her without linking; not her own note, not the linked one.
    expect(recall.unlinkedMentions.items.map((h) => h.entityId)).toEqual([unlinked.value.id]);
  });

  it('caps lists and refuses an unknown entity', async () => {
    const person = await createPerson(reg, { name: 'Quinn Busy' });
    if (!person.ok) throw new Error('setup failed');
    for (let i = 0; i < 3; i++) await addNote(reg, 'PERSON', person.value.id, { content: `Note ${i}` });
    const result = await recallEntity(reg, 'PERSON', person.value.id, 2);
    expect(result.ok && result.value.notes).toMatchObject({ truncated: true });
    expect(result.ok && result.value.notes.items).toHaveLength(2);
    expect((await recallEntity(reg, 'PERSON', 'no_such_person')).ok).toBe(false);
  });
});
