import { describe, it, expect } from 'vitest';
import { withFamily } from '../load-entity-options';

describe('withFamily', () => {
  it('names each row\'s direct children', () => {
    const rows = [
      { id: 'a', name: 'Eng', parentId: null },
      { id: 'b', name: 'Platform', parentId: 'a' },
      { id: 'c', name: 'Infra', parentId: 'a' },
      { id: 'd', name: 'Q3', parentId: 'b' }
    ];
    expect(withFamily(rows).map((r) => r.children)).toEqual([['Platform', 'Infra'], ['Q3'], undefined, undefined]);
  });

  it('names each row\'s parents, the top one first', () => {
    const rows = [
      { id: 'a', name: 'Eng', parentId: null },
      { id: 'b', name: 'Platform', parentId: 'a' },
      { id: 'c', name: 'Q3', parentId: 'b' }
    ];
    expect(withFamily(rows).map((r) => r.parents)).toEqual([undefined, 'Eng', 'Eng / Platform']);
  });

  it('stops at a parent that is missing or loops', () => {
    const rows = [
      { id: 'a', name: 'A', parentId: 'gone' },
      { id: 'x', name: 'X', parentId: 'y' },
      { id: 'y', name: 'Y', parentId: 'x' }
    ];
    expect(withFamily(rows).map((r) => r.parents)).toEqual([undefined, 'Y', 'X']);
  });
});
