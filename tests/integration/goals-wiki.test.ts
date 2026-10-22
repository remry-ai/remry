// Goals, wiki pages and relations against the real database: owners, the goal
// cascade, check-ins, page properties, mentions from content, and the cleanup
// a delete does.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { createDepartment, createTeam } from './org-helpers';
import { createProject, deleteProject, getProject, listProjects, updateProject } from '../../src/api/project/operations';
import { addCheckIn, addGoalProject, createGoal, getGoal, listGoals, updateGoal } from '../../src/api/goal/operations';
import { createPage, deletePage, getPage, updatePage, uploadPageImage } from '../../src/api/page/operations';
import { addDoc, getDoc, removeDoc, updateDoc, uploadDocImage } from '../../src/api/attached/doc/operations';
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
  it('a page → mentions from content → typed relation → cleanup on delete', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);

    const page = await createPage(reg, { title: 'Stripe', content: 'Payments. 5 seats.' });
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    const detail = await getPage(reg, page.value.id);
    expect(detail.ok && detail.value.content).toBe('Payments. 5 seats.');
    expect(detail.ok && detail.value.prompt).toBeNull();
    // A prompt makes the page a sync doc of its linked sources; null clears it.
    await updatePage(reg, page.value.id, { prompt: 'Contract: renewal date and seats.' });
    const synced = await getPage(reg, page.value.id);
    expect(synced.ok && synced.value.prompt).toBe('Contract: renewal date and seats.');
    await updatePage(reg, page.value.id, { prompt: null });
    expect((await getPage(reg, page.value.id)).ok).toBe(true);

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

describe('spreadsheet pages', () => {
  it('store a sheet, index its values, and only change body type while empty', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const sheet = {
      columns: [{ title: 'Item' }, { title: 'Cost' }],
      data: [['Rent', '1200'], ['Groceries', '400'], ['Total', '=SUM(B1:B2)']],
      values: [['Rent', '1200'], ['Groceries', '400'], ['Total', '1600']]
    };
    const page = await createPage(reg, { title: 'Household budget', bodyType: 'sheet', content: JSON.stringify(sheet) });
    expect(page.ok).toBe(true);
    if (!page.ok) return;

    const detail = await getPage(reg, page.value.id);
    expect(detail.ok && detail.value.bodyType).toBe('sheet');
    expect(detail.ok && JSON.parse(detail.value.content).values[2]).toEqual(['Total', '1600']);

    // The index holds what the cells showed, not the JSON or the formulas.
    const indexed = await reg.prisma.$queryRawUnsafe<{ body: string }[]>("SELECT body FROM search_index WHERE entity_type = 'PAGE' AND entity_id = ?", page.value.id);
    expect(indexed[0]?.body).toContain('Groceries 400');
    expect(indexed[0]?.body).toContain('1600');
    expect(indexed[0]?.body).not.toContain('SUM');
    expect(indexed[0]?.body).not.toContain('columns');

    const bad = await updatePage(reg, page.value.id, { content: '# not a sheet' });
    expect(!bad.ok && bad.error.message).toMatch(/sheet content/);
    const convert = await updatePage(reg, page.value.id, { bodyType: 'doc' });
    expect(!convert.ok && convert.error.message).toMatch(/already has content as a spreadsheet/);

    // An empty document can become a sheet, which starts blank.
    const blank = await createPage(reg, { title: 'Packing list' });
    if (!blank.ok) throw new Error('setup failed');
    expect((await updatePage(reg, blank.value.id, { bodyType: 'sheet' })).ok).toBe(true);
    const converted = await getPage(reg, blank.value.id);
    expect(converted.ok && converted.value.bodyType).toBe('sheet');
    expect(converted.ok && JSON.parse(converted.value.content).columns).toHaveLength(5);
  });
});

describe('images in a page', () => {
  it('stores a pasted image in the page\'s files and refuses content still at a blob: address', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const page = await createPage(reg, { title: 'Page with a screenshot' });
    if (!page.ok) throw page.error;

    const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
    const upload = await uploadPageImage(reg, page.value.id, png);
    if (!upload.ok) throw upload.error;
    expect(upload.value.key).toMatch(new RegExp(`^pages/${page.value.id}/image-.+\\.png$`));
    expect((await reg.storage.readObject(upload.value.key))?.contentType).toBe('image/png');

    const saved = await updatePage(reg, page.value.id, { content: `![shot](storage://${upload.value.key})` });
    expect(saved.ok).toBe(true);
    const lost = await updatePage(reg, page.value.id, { content: '![shot](blob:http://127.0.0.1:7369/abc)' });
    expect(!lost.ok && lost.error.message).toContain('blob:');
    expect((await uploadPageImage(reg, 'no-such-page', png)).ok).toBe(false);
  });
});

describe('deleting a doc or page with images', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');

  it('removes the page\'s images from disk', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const page = await createPage(reg, { title: 'Page with images to delete' });
    if (!page.ok) throw page.error;
    const upload = await uploadPageImage(reg, page.value.id, png);
    if (!upload.ok) throw upload.error;
    expect(await reg.storage.readObject(upload.value.key)).not.toBeNull();

    expect((await deletePage(reg, page.value.id)).ok).toBe(true);
    expect(await reg.storage.readObject(upload.value.key)).toBeNull();
  });

  it('removes the doc\'s images from disk, and those of a doc deleted with its entity', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const doc = await addDoc(reg, 'PERSON', 'person_bob', { title: 'Doc with an image' });
    if (!doc.ok) throw doc.error;
    const upload = await uploadDocImage(reg, doc.value.id, png);
    if (!upload.ok) throw upload.error;
    expect((await removeDoc(reg, doc.value.id)).ok).toBe(true);
    expect(await reg.storage.readObject(upload.value.key)).toBeNull();

    const project = await createProject(reg, { name: 'Project with an imaged doc' });
    if (!project.ok) throw project.error;
    const onProject = await addDoc(reg, 'PROJECT', project.value.id, { title: 'Spec' });
    if (!onProject.ok) throw onProject.error;
    const image = await uploadDocImage(reg, onProject.value.id, png);
    if (!image.ok) throw image.error;
    expect((await deleteProject(reg, project.value.id)).ok).toBe(true);
    expect(await reg.storage.readObject(image.value.key)).toBeNull();
  });
});

describe('moving a doc keeps its images', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');

  it('moves a doc to another entity with its images, links and place', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const from = await createProject(reg, { name: 'Moving from' });
    const to = await createProject(reg, { name: 'Moving to' });
    if (!from.ok || !to.ok) throw new Error('setup failed');
    const there = await addDoc(reg, 'PROJECT', to.value.id, { title: 'Already there' });
    if (!there.ok) throw there.error;
    const doc = await addDoc(reg, 'PROJECT', from.value.id, { title: 'Brief' });
    if (!doc.ok) throw doc.error;
    const image = await uploadDocImage(reg, doc.value.id, png);
    if (!image.ok) throw image.error;
    await updateDoc(reg, doc.value.id, { content: `Intro\n\n${image.value.markdown}` });

    expect((await updateDoc(reg, doc.value.id, { entityType: 'PROJECT', entityId: to.value.id })).ok).toBe(true);
    const moved = await getDoc(reg, doc.value.id);
    const before = await getDoc(reg, there.value.id);
    if (!moved.ok || !before.ok) throw new Error('docs gone');
    // On the new entity, after the docs already there.
    expect(moved.value.entityId).toBe(to.value.id);
    expect(moved.value.sortOrder).toBeGreaterThan(before.value.sortOrder);
    // Deleting where it came from takes nothing of it.
    expect((await deleteProject(reg, from.value.id)).ok).toBe(true);
    expect(await reg.storage.readObject(image.value.key)).not.toBeNull();
    expect((await getDoc(reg, doc.value.id)).ok).toBe(true);
  });

  it('refuses a move to a wiki page, or with only one end', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const doc = await addDoc(reg, 'PERSON', 'person_bob', { title: 'Stays put' });
    const page = await createPage(reg, { title: 'Not a doc holder' });
    if (!doc.ok || !page.ok) throw new Error('setup failed');
    const toPage = await updateDoc(reg, doc.value.id, { entityType: 'PAGE', entityId: page.value.id });
    expect(!toPage.ok && toPage.error.message).toContain("Wiki pages don't take docs");
    const half = await updateDoc(reg, doc.value.id, { entityId: 'person_alice' });
    expect(!half.ok && half.error.message).toContain('both entityType and entityId');
  });

  it('keeps a deleted doc\'s images in the trash for a day, so text copied after the delete still gets them', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const original = await addDoc(reg, 'PERSON', 'person_bob', { title: 'Deleted first' });
    if (!original.ok) throw original.error;
    const image = await uploadDocImage(reg, original.value.id, png);
    if (!image.ok) throw image.error;
    const text = `Before the delete:\n\n${image.value.markdown}`;
    await updateDoc(reg, original.value.id, { content: text });

    // The order the skill warns against: delete, then write the copy.
    expect((await removeDoc(reg, original.value.id)).ok).toBe(true);
    expect(await reg.storage.readObject(image.value.key)).toBeNull();
    const copy = await addDoc(reg, 'PERSON', 'person_alice', { title: 'Written after' });
    if (!copy.ok) throw copy.error;
    await updateDoc(reg, copy.value.id, { content: text });

    const copied = await getDoc(reg, copy.value.id);
    if (!copied.ok) throw copied.error;
    const key = /storage:\/\/([^)]+)/.exec(copied.value.content)?.[1];
    expect(key?.startsWith(`docs/${copy.value.id}/`)).toBe(true);
    expect(await reg.storage.readObject(key!)).not.toBeNull();
  });

  it('copies images shown from another doc, so deleting that doc loses nothing (a doc moved by copying, or made a page)', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const original = await addDoc(reg, 'PERSON', 'person_bob', { title: 'Original' });
    if (!original.ok) throw original.error;
    const image = await uploadDocImage(reg, original.value.id, png);
    if (!image.ok) throw image.error;
    const text = `Look:\n\n${image.value.markdown}`;
    await updateDoc(reg, original.value.id, { content: text });

    const copy = await addDoc(reg, 'PERSON', 'person_alice', { title: 'Copy' });
    if (!copy.ok) throw copy.error;
    await updateDoc(reg, copy.value.id, { content: text });
    const asPage = await createPage(reg, { title: 'Original as a page', content: text });
    if (!asPage.ok) throw asPage.error;

    expect((await removeDoc(reg, original.value.id)).ok).toBe(true);
    expect(await reg.storage.readObject(image.value.key)).toBeNull();

    const copied = await getDoc(reg, copy.value.id);
    const paged = await getPage(reg, asPage.value.id);
    if (!copied.ok || !paged.ok) throw new Error('copies gone');
    for (const [content, folder] of [
      [copied.value.content, `docs/${copy.value.id}/`],
      [paged.value.content, `pages/${asPage.value.id}/`]
    ] as const) {
      const key = /storage:\/\/([^)]+)/.exec(content)?.[1];
      expect(key?.startsWith(folder)).toBe(true);
      expect(await reg.storage.readObject(key!)).not.toBeNull();
    }
  });
});

describe('images taken out of a page\'s text', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');

  it('move aside on save, and come back when the text shows them again', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const page = await createPage(reg, { title: 'Page whose image is removed' });
    if (!page.ok) throw page.error;
    const upload = await uploadPageImage(reg, page.value.id, png);
    if (!upload.ok) throw upload.error;
    const name = upload.value.key.split('/').pop()!;
    const removedKey = `pages/${page.value.id}/removed/${name}`;
    const withImage = `Before\n\n![shot](storage://${upload.value.key})`;

    expect((await updatePage(reg, page.value.id, { content: withImage })).ok).toBe(true);
    expect(await reg.storage.readObject(upload.value.key)).not.toBeNull();

    expect((await updatePage(reg, page.value.id, { content: 'Before' })).ok).toBe(true);
    expect(await reg.storage.readObject(upload.value.key)).toBeNull();
    expect(await reg.storage.readObject(removedKey)).not.toBeNull();

    // An undo in the editor saves the image back, as the files route's path.
    expect((await updatePage(reg, page.value.id, { content: `Before\n\n![shot](/files/${upload.value.key})` })).ok).toBe(true);
    expect(await reg.storage.readObject(upload.value.key)).not.toBeNull();
    expect(await reg.storage.readObject(removedKey)).toBeNull();
  });
});
