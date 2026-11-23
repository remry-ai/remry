import { describe, expect, it } from 'vitest';
import { buildPageTree, buildProjectTree } from '../export-tree';

const page = (id: string, parentId: string | null) => ({ id, title: id, bodyType: 'doc', content: '', prompt: null, parentId });
const project = (id: string, parentId: string | null) => ({ id, name: id, description: null, status: null, parentId });
const doc = (id: string, entityId: string, sync = false) => ({ id, title: id, bodyType: 'doc', content: '', prompt: null, entityId, syncHolder: sync ? `PROJECT:${entityId}` : null });

describe('export trees', () => {
  it('nests pages in order', () => {
    const tree = buildPageTree(page('r', null), [page('a', 'r'), page('b', 'r'), page('a1', 'a')]);
    expect(tree.children.map((c) => c.id)).toEqual(['a', 'b']);
    expect(tree.children[0]!.children.map((c) => c.id)).toEqual(['a1']);
  });

  it('puts a project\'s docs (sync doc first) before its sub-projects', () => {
    const tree = buildProjectTree(project('p', null), [project('q', 'p')], [doc('d1', 'p'), doc('s', 'p', true), doc('d2', 'q')]);
    expect(tree.children.map((c) => `${c.kind}:${c.id}`)).toEqual(['DOC:s', 'DOC:d1', 'PROJECT:q']);
    expect(tree.children[2]!.children.map((c) => c.id)).toEqual(['d2']);
  });
});
