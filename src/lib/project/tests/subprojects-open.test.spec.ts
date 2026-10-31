import { describe, expect, it } from 'vitest';
import { parseOpenIds, setOpen } from '../subprojects-open';

describe('sub-projects open state', () => {
  it('reads what it wrote, and treats anything else as none open', () => {
    expect(parseOpenIds('["a","b",3]')).toEqual(['a', 'b']);
    expect(parseOpenIds('{"a":1}')).toEqual([]);
    expect(parseOpenIds('not json')).toEqual([]);
    expect(parseOpenIds(null)).toEqual([]);
  });

  it('opens a project once, as the newest, and closes it', () => {
    expect(setOpen(['a', 'b'], 'a', true)).toEqual(['b', 'a']);
    expect(setOpen(['a', 'b'], 'a', false)).toEqual(['b']);
    expect(setOpen(['a'], 'gone', false)).toEqual(['a']);
  });

  it('forgets the oldest past the limit', () => {
    expect(setOpen(['a', 'b', 'c'], 'd', true, 3)).toEqual(['b', 'c', 'd']);
  });
});
