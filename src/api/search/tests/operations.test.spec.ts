import { describe, it, expect } from 'vitest';
import { hitName, hitPath, searchableTypes, type IndexRow } from '../operations';
import { capped, excerpt, mentioningIds } from '../recall';
import type { RelationGroup } from '$shared/types/relations';

const row = (overrides: Partial<IndexRow>): IndexRow => ({
  entity_type: 'PERSON',
  entity_id: 'p1',
  parent_type: null,
  parent_id: null,
  title: '',
  body_start: '',
  snippet: '',
  score: -1,
  ...overrides
});

describe('hitPath', () => {
  it('opens a top-level entity on its own page', () => {
    expect(hitPath(row({ entity_type: 'PAGE', entity_id: 'w1' }))).toBe('/app/wiki/w1');
  });

  it('opens a doc in its entity, a todo in its popup, and other attachments on their entity', () => {
    const on = { parent_type: 'PERSON', parent_id: 'p1' };
    expect(hitPath(row({ entity_type: 'DOC', entity_id: 'd1', ...on }))).toBe('/app/people/p1?doc=d1');
    expect(hitPath(row({ entity_type: 'TODO', entity_id: 't1', ...on }))).toBe('/app/people/p1?popup=todo&todo=t1');
    expect(hitPath(row({ entity_type: 'NOTE', entity_id: 'n1', ...on }))).toBe('/app/people/p1');
    expect(hitPath(row({ entity_type: 'GOAL_CHECKIN', entity_id: 'c1', parent_type: 'GOAL', parent_id: 'g1' }))).toBe('/app/goals/g1');
  });

  it('opens a report on its own page', () => {
    expect(hitPath(row({ entity_type: 'REPORT', entity_id: 'r1', parent_type: 'TEAM', parent_id: 't1' }))).toBe('/app/reports/r1');
  });
});

describe('hitName', () => {
  it('uses the title, else the first line of the text', () => {
    expect(hitName(row({ title: 'Alice' }))).toBe('Alice');
    expect(hitName(row({ entity_type: 'NOTE', body_start: '\n## Wants to lead\nthe migration' }))).toBe('Wants to lead');
  });
});

describe('searchableTypes', () => {
  it('searches every type but reports while they are off', () => {
    expect(searchableTypes(undefined, false)).not.toContain('REPORT');
    expect(searchableTypes(undefined, true)).toContain('REPORT');
    expect(searchableTypes(['NOTE', 'REPORT'], false)).toEqual(['NOTE']);
  });
});

describe('recall helpers', () => {
  it('caps a list and flags the rest', () => {
    expect(capped([1, 2, 3], 2)).toEqual({ items: [1, 2], truncated: true });
    expect(capped([1, 2], 2)).toEqual({ items: [1, 2], truncated: false });
  });

  it('cuts an excerpt at a word boundary', () => {
    expect(excerpt('short  text\n')).toBe('short text');
    expect(excerpt('alpha beta gamma delta', 12)).toBe('alpha beta…');
  });

  it('finds the sources that already mention the entity', () => {
    const other = (entityId: string) => ({ entityType: 'NOTE' as const, entityId, label: null, path: '' });
    const groups: RelationGroup[] = [
      { label: 'Related to', items: [{ id: 'r1', kind: 'RELATED', direction: 'incoming', label: 'Related to', other: other('a'), note: null, createdAt: new Date(0) }] },
      { label: 'Mentioned in', items: [{ id: 'r2', kind: 'MENTIONS', direction: 'incoming', label: 'Mentioned in', other: other('b'), note: null, createdAt: new Date(0) }] },
      { label: 'Mentions', items: [{ id: 'r3', kind: 'MENTIONS', direction: 'outgoing', label: 'Mentions', other: other('c'), note: null, createdAt: new Date(0) }] }
    ];
    expect(mentioningIds(groups)).toEqual(['b']);
  });
});
