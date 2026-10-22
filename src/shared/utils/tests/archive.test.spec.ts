import { describe, it, expect } from 'vitest';
import { doneShown, matchesDone, parseArchiveFilter } from '../archive';

describe('archive and done filter', () => {
  it('reads done as not archived for the list call', () => {
    expect(parseArchiveFilter('done')).toBe('exclude');
  });

  it('hides done rows from Active and shows only them under Done', () => {
    expect(doneShown(null)).toBe('hide');
    expect(doneShown('done')).toBe('only');
    expect(doneShown('only')).toBe('any');
    expect(doneShown('include')).toBe('any');
    expect(matchesDone(true, 'hide')).toBe(false);
    expect(matchesDone(false, 'hide')).toBe(true);
    expect(matchesDone(true, 'only')).toBe(true);
    expect(matchesDone(false, 'only')).toBe(false);
    expect(matchesDone(true, 'any')).toBe(true);
  });
});
