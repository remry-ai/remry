import { describe, it, expect } from 'vitest';
import type { SearchHit } from '$shared/types/search';
import { autocompleteRows, snippetParts, submittedRows, titleMatches, type FinderEntry, type FinderRow } from '../quick-finder';

const entries: readonly FinderEntry[] = [
  { id: 'GROUP:1', name: 'Console', scope: 'GROUP', meta: 'Team' },
  { id: 'PROJECT:1', name: 'Console migration', scope: 'PROJECT', meta: 'Project' },
  { id: 'PROJECT:2', name: 'Migrate the web console', scope: 'PROJECT', meta: 'Project' },
  { id: 'route:/app/teams', name: 'Teams', meta: 'Go to' },
  { id: 'notebook:side', name: 'Switch to side', meta: 'Notebook' }
];
const home = [entries[3]!];

const hit = (entityType: SearchHit['entityType'], entityId: string): SearchHit => ({
  entityType,
  entityId,
  name: entityId,
  path: `/app/x/${entityId}`,
  on: null,
  snippet: '',
  score: 0
});

const keys = (rows: readonly FinderRow[]): readonly string[] => rows.map((row) => row.key);

describe('autocompleteRows', () => {
  it('lists the app sections before anything is typed', () => {
    expect(keys(autocompleteRows('', entries, home))).toEqual(['route:/app/teams']);
  });

  it('lists names containing the query, those starting with it first', () => {
    expect(keys(autocompleteRows('con', entries, home))).toEqual(['GROUP:1', 'PROJECT:1', 'PROJECT:2']);
    expect(keys(autocompleteRows('side', entries, home))).toEqual(['notebook:side']);
  });

  it('treats a slash as plain text', () => {
    expect(keys(autocompleteRows('/team', entries, home))).toEqual([]);
  });
});

describe('titleMatches', () => {
  it('matches every word in any order', () => {
    expect(titleMatches(entries, 'console migra').map((e) => e.id)).toEqual(['PROJECT:1', 'PROJECT:2']);
    expect(titleMatches(entries, 'web migrate').map((e) => e.id)).toEqual(['PROJECT:2']);
    expect(titleMatches(entries, '   ')).toEqual([]);
  });
});

describe('submittedRows', () => {
  it('lists title matches, then full-text hits that are not already listed', () => {
    const rows = submittedRows([entries[2]!], [hit('PROJECT', '2'), hit('NOTE', 'n1')]);
    expect(keys(rows)).toEqual(['PROJECT:2', 'hit:NOTE:n1']);
  });
});

describe('snippetParts', () => {
  it('splits out the bold matches', () => {
    expect(snippetParts('the **web** console **move**')).toEqual([
      { text: 'the ', match: false },
      { text: 'web', match: true },
      { text: ' console ', match: false },
      { text: 'move', match: true }
    ]);
  });
});
