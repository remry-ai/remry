// entity.exportTree, what the app's markdown export reads: a page with its sub-pages, a project
// with its docs and sub-projects at any depth, archived children left out, the root kept even
// when archived.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { createProject } from '../../src/api/project/operations';
import { createPage } from '../../src/api/page/operations';
import { addDoc } from '../../src/api/attached/doc/operations';
import { setArchived } from '../../src/api/_archive';
import { exportTree } from '../../src/api/entity/export-tree';
import { TEST_NOTEBOOK } from './test-notebooks';

const reg = getRegistry(TEST_NOTEBOOK);

const value = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

describe('entity.exportTree', () => {
  it('reads a page tree with content, leaving out archived sub-pages', async () => {
    const root = value(await createPage(reg, { title: 'Export root', content: 'Top' }));
    const child = value(await createPage(reg, { title: 'Export child', parentId: root.id, content: 'Middle' }));
    value(await createPage(reg, { title: 'Export grandchild', parentId: child.id, content: 'Bottom' }));
    const gone = value(await createPage(reg, { title: 'Export archived', parentId: root.id }));
    value(await setArchived(reg, 'PAGE', gone.id, true));
    value(await setArchived(reg, 'PAGE', root.id, true));

    const tree = value(await exportTree(reg, 'PAGE', root.id));
    expect(tree.content).toBe('Top');
    expect(tree.children.map((c) => c.title)).toEqual(['Export child']);
    expect(tree.children[0]!.children.map((c) => c.content)).toEqual(['Bottom']);
  });

  it('reads a project with its docs, then its sub-projects with theirs', async () => {
    const project = value(await createProject(reg, { name: 'Export project', description: 'Brief' }));
    const sub = value(await createProject(reg, { name: 'Export sub-project', parentId: project.id }));
    value(await addDoc(reg, 'PROJECT', project.id, { title: 'Plan' }));
    value(await addDoc(reg, 'PROJECT', sub.id, { title: 'Notes', bodyType: 'sheet' }));

    const tree = value(await exportTree(reg, 'PROJECT', project.id));
    expect(tree.content).toBe('Brief');
    expect(tree.children.map((c) => `${c.kind}:${c.title}`)).toEqual(['DOC:Plan', 'PROJECT:Export sub-project']);
    expect(tree.children[1]!.children.map((c) => `${c.kind}:${c.bodyType}`)).toEqual(['DOC:sheet']);
  });

  it('says what is missing', async () => {
    const r = await exportTree(reg, 'DOC', 'nope');
    expect(r.ok).toBe(false);
  });
});
