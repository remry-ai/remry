import { describe, it, expect } from 'vitest';
import type { SearchHit } from '$shared/types/search';
import { appLink, autocompleteRows, completeCommand, parseFinderQuery, snippetParts, submittedRows, titleMatches, type FinderEntry, type FinderRow } from '../quick-finder';

const entries: readonly FinderEntry[] = [
  { id: 'GROUP:1', name: 'Console', scope: 'GROUP', meta: 'Team' },
  { id: 'PROJECT:1', name: 'Console migration', scope: 'PROJECT', meta: 'Project' },
  { id: 'PROJECT:2', name: 'Migrate the web console', scope: 'PROJECT', meta: 'Project' }
];

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

describe('parseFinderQuery', () => {
  it('reads plain text as names', () => {
    expect(parseFinderQuery('dana')).toEqual({ kind: 'names', text: 'dana' });
  });

  it('offers the commands a "/" word could be', () => {
    expect(parseFinderQuery('/')).toMatchObject({ kind: 'commands', commands: [{ id: 'search' }, { id: 'ask' }] });
    expect(parseFinderQuery('/a')).toMatchObject({ kind: 'commands', commands: [{ id: 'ask' }] });
    expect(parseFinderQuery('/x')).toEqual({ kind: 'commands', commands: [] });
    expect(parseFinderQuery('/x y')).toEqual({ kind: 'commands', commands: [] });
  });

  it('reads /search and /ask with what follows', () => {
    expect(parseFinderQuery('/search budget review')).toEqual({ kind: 'search', text: 'budget review' });
    expect(parseFinderQuery('/ask who owns billing?')).toEqual({ kind: 'ask', text: 'who owns billing?' });
    expect(parseFinderQuery('/search ')).toEqual({ kind: 'search', text: '' });
  });

  it('reads a shortened command followed by a space', () => {
    expect(parseFinderQuery('/s budget')).toEqual({ kind: 'search', text: 'budget' });
    expect(parseFinderQuery('/a why?')).toEqual({ kind: 'ask', text: 'why?' });
  });
});

describe('completeCommand', () => {
  it('completes a partly typed command', () => {
    expect(completeCommand('/s')).toBe('/search ');
    expect(completeCommand('/a')).toBe('/ask ');
    expect(completeCommand('/ASK')).toBe('/ask ');
  });

  it('completes the highlighted command when several match', () => {
    expect(completeCommand('/', 1)).toBe('/ask ');
    expect(completeCommand('/')).toBe('/search ');
  });

  it('leaves anything else alone', () => {
    expect(completeCommand('dana')).toBeNull();
    expect(completeCommand('/x')).toBeNull();
    expect(completeCommand('/search budget')).toBeNull();
  });
});

describe('autocompleteRows', () => {
  it('lists the commands before anything is typed', () => {
    expect(keys(autocompleteRows('', entries))).toEqual(['command:search', 'command:ask']);
  });

  it('lists names containing the text, those starting with it first', () => {
    expect(keys(autocompleteRows('con', entries))).toEqual(['GROUP:1', 'PROJECT:1', 'PROJECT:2']);
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

describe('appLink', () => {
  it('keeps app paths only', () => {
    expect(appLink('/app/people/1')).toBe('/app/people/1');
    expect(appLink('https://example.com')).toBeNull();
    expect(appLink(null)).toBeNull();
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
