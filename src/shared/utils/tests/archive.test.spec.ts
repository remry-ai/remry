import { describe, it, expect } from 'vitest';
import { parseArchiveFilter, statusListFilters } from '../archive';

describe('archive and closed filter', () => {
  it('reads closed as not archived', () => {
    expect(parseArchiveFilter('closed')).toBe('exclude');
  });

  it('leaves closed items out of Active, and shows only them under Closed', () => {
    expect(statusListFilters(null)).toEqual({ archived: 'exclude', closed: 'exclude' });
    expect(statusListFilters('closed')).toEqual({ archived: 'exclude', closed: 'only' });
    expect(statusListFilters('only')).toEqual({ archived: 'only', closed: 'include' });
    expect(statusListFilters('include')).toEqual({ archived: 'include', closed: 'include' });
    expect(statusListFilters('nonsense')).toEqual({ archived: 'exclude', closed: 'exclude' });
  });
});
