import { describe, it, expect } from 'vitest';
import { completeScopeWord, matchScopes, parseSearchQuery, searchOptions, typedScope } from '../search-picker';

const scopes = [
  { id: 'PERSON', label: 'Person', slash: 'person' },
  { id: 'TEAM', label: 'Team', slash: 'team' },
  { id: 'PROJECT', label: 'Project', slash: 'project' },
  { id: 'PAGE', label: 'Wiki', slash: 'wiki' }
];

const options = [
  { id: 'PERSON:1', name: 'Alice Johnson', scope: 'PERSON' },
  { id: 'TEAM:1', name: 'Payments', scope: 'TEAM' },
  { id: 'PAGE:1', name: 'Stripe payments', scope: 'PAGE' },
  { id: 'PERSON:2', name: 'Pat Lee', scope: 'PERSON' }
];

describe('matchScopes', () => {
  it('lists every scope for a bare slash and narrows as the word is typed', () => {
    expect(matchScopes('/', scopes)?.map((s) => s.id)).toEqual(['PERSON', 'TEAM', 'PROJECT', 'PAGE']);
    expect(matchScopes('/te', scopes)?.map((s) => s.id)).toEqual(['TEAM']);
    expect(matchScopes('/zz', scopes)).toEqual([]);
  });

  it('ignores a query without a slash', () => {
    expect(matchScopes('pay', scopes)).toBeNull();
  });
});

describe('typedScope', () => {
  it('picks a scope typed in full, followed by a space', () => {
    expect(typedScope('/person ali', scopes)).toEqual({ scope: scopes[0], rest: 'ali' });
    expect(typedScope('/Wiki ', scopes)).toEqual({ scope: scopes[3], rest: '' });
  });

  it('picks a partly typed scope as soon as a space follows it', () => {
    expect(typedScope('/pro ', scopes)).toEqual({ scope: scopes[2], rest: '' });
    expect(typedScope('/t api', scopes)).toEqual({ scope: scopes[1], rest: 'api' });
  });

  it('picks the highlighted scope when the word starts several, else the first', () => {
    expect(typedScope('/p ', scopes, 1)).toEqual({ scope: scopes[2], rest: '' });
    expect(typedScope('/p ', scopes)).toEqual({ scope: scopes[0], rest: '' });
  });

  it('waits for a space and a word that matches', () => {
    expect(typedScope('/person', scopes)).toBeNull();
    expect(typedScope('/zz ali', scopes)).toBeNull();
    expect(typedScope('person ali', scopes)).toBeNull();
  });
});

describe('parseSearchQuery', () => {
  it('searches everything for a plain query', () => {
    expect(parseSearchQuery('console', scopes)).toEqual({ scopes: null, scope: null, text: 'console' });
  });

  it('offers scopes while the slash word is being typed', () => {
    expect(parseSearchQuery('/te', scopes)).toEqual({ scopes: [scopes[1]], scope: null, text: '' });
  });

  it('searches within the scope a slash word names, keeping the text as typed', () => {
    expect(parseSearchQuery('/team console', scopes)).toEqual({ scopes: null, scope: scopes[1], text: 'console' });
    expect(parseSearchQuery('/team ', scopes)).toEqual({ scopes: null, scope: scopes[1], text: '' });
  });

  it('offers nothing for a slash word no scope starts', () => {
    expect(parseSearchQuery('/zz ali', scopes)).toEqual({ scopes: [], scope: null, text: '' });
  });
});

describe('completeScopeWord', () => {
  it('completes a partly typed word once a space follows it', () => {
    expect(completeScopeWord('/pro ', scopes)).toBe('/project ');
    expect(completeScopeWord('/p ', scopes, 1)).toBe('/project ');
  });

  it('leaves everything else alone', () => {
    expect(completeScopeWord('/pro', scopes)).toBe('/pro');
    expect(completeScopeWord('/pro api', scopes)).toBe('/pro api');
    expect(completeScopeWord('/zz ', scopes)).toBe('/zz ');
    expect(completeScopeWord('pro ', scopes)).toBe('pro ');
  });
});

describe('searchOptions', () => {
  it('matches names anywhere, with names that start with the query first', () => {
    expect(searchOptions(options, 'pay', null).map((o) => o.id)).toEqual(['TEAM:1', 'PAGE:1']);
    expect(searchOptions(options, 'PAY', null).map((o) => o.id)).toEqual(['TEAM:1', 'PAGE:1']);
  });

  it('searches only within a scope', () => {
    expect(searchOptions(options, 'pa', 'PERSON').map((o) => o.id)).toEqual(['PERSON:2']);
    expect(searchOptions(options, '', 'PERSON').map((o) => o.id)).toEqual(['PERSON:1', 'PERSON:2']);
  });

  it('stops at the limit', () => {
    expect(searchOptions(options, '', null, 2)).toHaveLength(2);
  });
});
