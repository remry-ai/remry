import { describe, it, expect } from 'vitest';
import { ancestorsOf, buildTree, flattenTree, scopeTree, wouldCreateCycle } from '../hierarchy';

const parentsOf = (map: Readonly<Record<string, string | null>>) => (id: string) => map[id];

describe('wouldCreateCycle', () => {
  const tree = { a: null, b: 'a', c: 'b', d: null };

  it('allows a parent outside the subtree', () => {
    expect(wouldCreateCycle(parentsOf(tree), 'b', 'd')).toBe(false);
  });

  it('rejects the item itself', () => {
    expect(wouldCreateCycle(parentsOf(tree), 'b', 'b')).toBe(true);
  });

  it('rejects a descendant', () => {
    expect(wouldCreateCycle(parentsOf(tree), 'a', 'c')).toBe(true);
  });

  it('always allows clearing the parent', () => {
    expect(wouldCreateCycle(parentsOf(tree), 'a', null)).toBe(false);
  });

  it('stops on a loop that does not include the item', () => {
    expect(wouldCreateCycle(parentsOf({ x: 'y', y: 'x', a: null }), 'a', 'x')).toBe(false);
  });
});

describe('ancestorsOf', () => {
  const items = [
    { id: 'a', parentId: null },
    { id: 'b', parentId: 'a' },
    { id: 'c', parentId: 'b' },
    { id: 'x', parentId: 'y' },
    { id: 'y', parentId: 'x' },
    { id: 'z', parentId: 'gone' }
  ];
  const ids = (id: string) => ancestorsOf(items, id, (i) => i.parentId).map((i) => i.id);

  it('lists the ancestors root first', () => {
    expect(ids('c')).toEqual(['a', 'b']);
    expect(ids('a')).toEqual([]);
  });

  it('stops at a missing parent or a loop', () => {
    expect(ids('z')).toEqual([]);
    expect(ids('x')).toEqual(['y']);
    expect(ids('missing')).toEqual([]);
  });
});

describe('buildTree', () => {
  it('nests children under their parents in order, with orphans as roots', () => {
    const items = [
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'b' },
      { id: 'd', parentId: 'missing' },
      { id: 'e', parentId: 'a' }
    ];
    const rows = flattenTree(buildTree(items, (i) => i.parentId)).map((n) => [n.item.id, n.depth]);
    expect(rows).toEqual([['a', 0], ['b', 1], ['c', 2], ['e', 1], ['d', 0]]);
  });

  it('keeps items caught in a parent cycle', () => {
    const items = [{ id: 'x', parentId: 'y' }, { id: 'y', parentId: 'x' }];
    const ids = flattenTree(buildTree(items, (i) => i.parentId)).map((n) => n.item.id);
    expect([...ids].sort()).toEqual(['x', 'y']);
  });
});

describe('flattenTree', () => {
  const forest = buildTree(
    [
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'b' },
      { id: 'd', parentId: null }
    ],
    (i) => i.parentId
  );

  it('keeps a collapsed node but skips its descendants', () => {
    const ids = flattenTree(forest, (n) => n.item.id === 'b').map((n) => n.item.id);
    expect(ids).toEqual(['a', 'b', 'd']);
  });
});

describe('scopeTree', () => {
  const forest = buildTree(
    [
      { id: 'root', parentId: null, team: 'none' },
      { id: 'mine', parentId: 'root', team: 'x' },
      { id: 'theirs', parentId: 'root', team: 'y' },
      { id: 'deep', parentId: 'theirs', team: 'x' },
      { id: 'other', parentId: null, team: 'y' },
      { id: 'other-child', parentId: 'other', team: 'y' }
    ],
    (i) => i.parentId
  );

  it('keeps matches and marks the ancestors leading to them as context, keeping depth', () => {
    const rows = flattenTree(scopeTree(forest, (i) => i.team === 'x')).map((n) => [n.item.id, n.depth, n.context]);
    expect(rows).toEqual([
      ['root', 0, true],
      ['mine', 1, false],
      ['theirs', 1, true],
      ['deep', 2, false]
    ]);
  });

  it('drops non-matching children of a match and subtrees with no match', () => {
    const ids = flattenTree(scopeTree(forest, (i) => i.id === 'root' || i.id === 'other')).map((n) => n.item.id);
    expect(ids).toEqual(['root', 'other']);
  });
});
