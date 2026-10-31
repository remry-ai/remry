import { describe, expect, it } from 'vitest';
import { parseStoredCollapse, withView } from '../collapse-state';

describe('projects table collapse state', () => {
  it('reads what it wrote, and leaves out anything unreadable', () => {
    expect(parseStoredCollapse('{"|none":{"base":"collapsed","toggled":["a",2]}}')).toEqual({ '|none': { base: 'collapsed', toggled: ['a'] } });
    expect(parseStoredCollapse('{"x":{"base":"sideways","toggled":[]},"y":null}')).toEqual({});
    expect(parseStoredCollapse('not json')).toEqual({});
    expect(parseStoredCollapse('[1]')).toEqual({});
    expect(parseStoredCollapse(null)).toEqual({});
  });

  it('keeps a changed view, dropping projects that are gone', () => {
    const next = withView({}, '|none', { base: 'collapsed', toggled: ['a', 'gone'] }, 'collapsed', new Set(['a', 'b']));
    expect(next).toEqual({ '|none': { base: 'collapsed', toggled: ['a'] } });
  });

  it('forgets a view that is back at its default, keeping the others', () => {
    const stored = { '|none': { base: 'collapsed' as const, toggled: ['a'] }, '|team': { base: 'collapsed' as const, toggled: [] } };
    expect(withView(stored, '|none', { base: 'collapsed', toggled: [] }, 'collapsed', new Set(['a']))).toEqual({ '|team': stored['|team'] });
    // Expand all in a view that starts collapsed is remembered.
    expect(withView({}, '|none', { base: 'expanded', toggled: [] }, 'collapsed', new Set())).toEqual({ '|none': { base: 'expanded', toggled: [] } });
  });
});
