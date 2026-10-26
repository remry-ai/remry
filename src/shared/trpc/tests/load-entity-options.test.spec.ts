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
    expect(withFamily(rows).map((r) => r.parents)).toEqual([undefined, ['Eng'], ['Eng', 'Platform']]);
  });

  it('stops at a parent that is missing or loops', () => {
    const rows = [
      { id: 'a', name: 'A', parentId: 'gone' },
      { id: 'x', name: 'X', parentId: 'y' },
      { id: 'y', name: 'Y', parentId: 'x' }
    ];
    expect(withFamily(rows).map((r) => r.parents)).toEqual([undefined, ['Y'], ['X']]);
  });

  it('gives the same trails whichever order the rows come in', () => {
    const rows = [
      { id: 'd', name: 'D', parentId: 'c' },
      { id: 'b', name: 'B', parentId: 'a' },
      { id: 'c', name: 'C', parentId: 'b' },
      { id: 'a', name: 'A', parentId: null },
      { id: 'e', name: 'E', parentId: 'c' }
    ];
    expect(withFamily(rows).map((r) => r.parents)).toEqual([['A', 'B', 'C'], ['A'], ['A', 'B'], undefined, ['A', 'B', 'C']]);
  });

  it('keeps a loop\'s trails apart from where the walk started', () => {
    const rows = [
      { id: 'x', name: 'X', parentId: 'y' },
      { id: 'y', name: 'Y', parentId: 'x' },
      { id: 'z', name: 'Z', parentId: 'x' }
    ];
    expect(withFamily(rows).map((r) => r.parents)).toEqual([['Y'], ['X'], ['Y', 'X']]);
  });
});
