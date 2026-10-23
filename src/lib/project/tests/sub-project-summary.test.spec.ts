import { describe, expect, it } from 'vitest';
import { statusCounts } from '../sub-project-summary';

describe('statusCounts', () => {
  it('counts each status in the statuses’ order, with none last', () => {
    const counts = statusCounts([
      { status: 'done' },
      { status: null },
      { status: 'in-progress' },
      { status: 'done' },
      { status: 'someday' },
      { status: 'blocked' },
    ]);
    expect(counts.map((c) => [c.label, c.count])).toEqual([
      ['in progress', 1],
      ['blocked', 1],
      ['done', 2],
      ['someday', 1],
      ['no status', 1],
    ]);
  });

  it('is empty for no sub-projects', () => {
    expect(statusCounts([])).toEqual([]);
  });
});
