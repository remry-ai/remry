import { describe, expect, it } from 'vitest';
import { buildOrgTree, countDescendants, pathToPerson, type OrgPerson, type OrgTreeNode } from './org-tree';

const p = (id: string, leadId: string | null = null, name = id): OrgPerson => ({ id, name, title: null, leadId });

const shape = (nodes: readonly OrgTreeNode[]): unknown =>
  nodes.map((n) => (n.children.length ? { [n.person.id]: shape(n.children) } : n.person.id));

const allIds = (nodes: readonly OrgTreeNode[]): string[] =>
  nodes.flatMap((n) => [n.person.id, ...allIds(n.children)]);

describe('buildOrgTree', () => {
  it('returns nothing for no people', () => {
    expect(buildOrgTree([])).toEqual([]);
  });

  it('nests reports under leads, sorted by name, across several roots', () => {
    const tree = buildOrgTree([p('c', 'a'), p('b', 'a'), p('d', 'c'), p('z'), p('a')]);
    expect(shape(tree)).toEqual([{ a: ['b', { c: ['d'] }] }, 'z']);
    expect(countDescendants(tree[0]!)).toBe(3);
  });

  it('treats a missing lead as a root', () => {
    expect(shape(buildOrgTree([p('a', 'gone')]))).toEqual(['a']);
  });

  it('breaks a two-person cycle and keeps everyone once', () => {
    const tree = buildOrgTree([p('a', 'b'), p('b', 'a'), p('c', 'b')]);
    expect(shape(tree)).toEqual([{ a: [{ b: ['c'] }] }]);
    expect(allIds(tree).sort()).toEqual(['a', 'b', 'c']);
  });

  it('treats a self-lead as a root', () => {
    expect(shape(buildOrgTree([p('a', 'a'), p('b', 'a')]))).toEqual([{ a: ['b'] }]);
  });
});

describe('pathToPerson', () => {
  const roots = buildOrgTree([
    { id: 'a', name: 'Ada', title: null, leadId: null },
    { id: 'b', name: 'Bo', title: null, leadId: 'a' },
    { id: 'c', name: 'Cy', title: null, leadId: 'b' }
  ]);

  it('lists the leads down to the person', () => {
    expect(pathToPerson(roots, 'c')).toEqual(['a', 'b', 'c']);
  });

  it('is empty for someone not in the tree', () => {
    expect(pathToPerson(roots, 'zz')).toEqual([]);
  });
});
