import { describe, it, expect } from 'vitest';
import { withParents } from '../load-entity-options';

describe('withParents', () => {
  it('names each row\'s parents, the top one first', () => {
    const rows = [
      { id: 'a', name: 'Eng', parentId: null },
      { id: 'b', name: 'Platform', parentId: 'a' },
      { id: 'c', name: 'Q3', parentId: 'b' }
    ];
    expect(withParents(rows).map((r) => r.parents)).toEqual([undefined, 'Eng', 'Eng / Platform']);
  });

  it('stops at a parent that is missing or loops', () => {
    const rows = [
      { id: 'a', name: 'A', parentId: 'gone' },
      { id: 'x', name: 'X', parentId: 'y' },
      { id: 'y', name: 'Y', parentId: 'x' }
    ];
    expect(withParents(rows).map((r) => r.parents)).toEqual([undefined, 'Y', 'X']);
  });
});
