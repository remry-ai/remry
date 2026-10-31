import { describe, expect, it } from 'vitest';
import { buildOrgTree, type OrgPerson } from './org-tree';
import { defaultOpenPath, parseOpenPath, setOpenAt, startingOpenPath, validOpenPath } from './open-path';

const p = (id: string, leadId: string | null = null): OrgPerson => ({ id, name: id, title: null, leadId });

// a leads b and c; c leads d; d leads e. z stands alone.
const roots = buildOrgTree([p('a'), p('b', 'a'), p('c', 'a'), p('d', 'c'), p('e', 'd'), p('z')]);

describe('org chart open path', () => {
  it('reads a stored path, and treats anything else as nothing stored', () => {
    expect(parseOpenPath('["a","c"]')).toEqual(['a', 'c']);
    expect(parseOpenPath('[]')).toEqual([]);
    expect(parseOpenPath('["a", 2]')).toEqual(['a']);
    expect(parseOpenPath(null)).toBeNull();
    expect(parseOpenPath('not json')).toBeNull();
    expect(parseOpenPath('{"a":1}')).toBeNull();
  });

  it('opens the first lead in the top row by default', () => {
    expect(defaultOpenPath(roots)).toEqual(['a']);
    expect(defaultOpenPath(buildOrgTree([p('x'), p('y')]))).toEqual([]);
  });

  it('keeps only the part of a path that still opens leads', () => {
    expect(validOpenPath(roots, ['a', 'c', 'd'])).toEqual(['a', 'c', 'd']);
    // b has no reports, so it opens nothing; gone isn't in the chart.
    expect(validOpenPath(roots, ['a', 'b'])).toEqual(['a']);
    expect(validOpenPath(roots, ['a', 'gone', 'd'])).toEqual(['a']);
    // d is in the chart, but not in the row a opens.
    expect(validOpenPath(roots, ['a', 'd'])).toEqual(['a']);
    expect(validOpenPath(roots, ['gone'])).toEqual([]);
  });

  it('opening a lead closes the rows below it; closing one keeps the rows above', () => {
    expect(setOpenAt(['a', 'c', 'd'], 1, 'b')).toEqual(['a', 'b']);
    expect(setOpenAt(['a', 'c', 'd'], 1, null)).toEqual(['a']);
    expect(setOpenAt(['a'], 1, 'c')).toEqual(['a', 'c']);
    expect(setOpenAt(['a', 'c'], 0, null)).toEqual([]);
  });

  it('starts from the remembered path, falling back to the default when none of it is left', () => {
    expect(startingOpenPath(roots, null)).toEqual(['a']);
    expect(startingOpenPath(roots, ['a', 'c'])).toEqual(['a', 'c']);
    expect(startingOpenPath(roots, [])).toEqual([]);
    expect(startingOpenPath(roots, ['gone'])).toEqual(['a']);
  });
});
