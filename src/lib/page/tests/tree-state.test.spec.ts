import { describe, it, expect } from 'vitest';
import { parentIds, parseCollapsed, serialiseCollapsed, toggleId } from '../tree-state';

describe('wiki tree state', () => {
  it('reads what it wrote, and treats anything else as nothing collapsed', () => {
    expect([...parseCollapsed(serialiseCollapsed(new Set(['a', 'b'])))]).toEqual(['a', 'b']);
    expect(serialiseCollapsed(new Set())).toBeNull();
    expect(parseCollapsed(null).size).toBe(0);
    expect(parseCollapsed('not json').size).toBe(0);
    expect(parseCollapsed('{"a":1}').size).toBe(0);
    expect([...parseCollapsed('["a", 2, null]')]).toEqual(['a']);
  });

  it('finds the pages with sub-pages', () => {
    const pages = [
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'b' },
      { id: 'd', parentId: 'gone' }
    ];
    expect([...parentIds(pages)].sort()).toEqual(['a', 'b']);
  });

  it('toggles one id', () => {
    expect([...toggleId(new Set(['a']), 'b')]).toEqual(['a', 'b']);
    expect([...toggleId(new Set(['a']), 'a')]).toEqual([]);
  });
});
