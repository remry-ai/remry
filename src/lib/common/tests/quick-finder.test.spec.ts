import { describe, it, expect } from 'vitest';
import type { SearchHit } from '$shared/types/search';
import { FINDER_SCOPES, appLink, groupKindScopes, inScope, autocompleteRows, completeCommand, completeScope, docEntries, finderHierarchy, parseScope, scopeSuggestions, todoEntries, parseFinderQuery, snippetParts, submittedRows, titleMatches, type FinderEntry, type FinderRow } from '../quick-finder';

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

describe('parseScope', () => {
  it('narrows to the type a keyword and colon name, by any prefix or the plural', () => {
    expect(parseScope('project: api', FINDER_SCOPES)).toMatchObject({ scope: { type: 'PROJECT' }, text: 'api' });
    expect(parseScope('pro:api', FINDER_SCOPES)).toMatchObject({ scope: { type: 'PROJECT' }, text: 'api' });
    expect(parseScope('Projects: api gateway', FINDER_SCOPES)).toMatchObject({ scope: { type: 'PROJECT' }, text: 'api gateway' });
    expect(parseScope('people: dana', FINDER_SCOPES).scope?.type).toBe('PERSON');
    expect(parseScope('wiki: rota', FINDER_SCOPES).scope?.type).toBe('PAGE');
    expect(parseScope('todo:', FINDER_SCOPES)).toMatchObject({ scope: { type: 'TODO' }, text: '' });
  });

  it('picks the first type in order for a short prefix that fits several', () => {
    expect(parseScope('p: x', FINDER_SCOPES).scope?.type).toBe('PERSON');
    expect(parseScope('pr: x', FINDER_SCOPES).scope?.type).toBe('PROJECT');
    expect(parseScope('pa: x', FINDER_SCOPES).scope?.type).toBe('PAGE');
    expect(parseScope('go: x', FINDER_SCOPES).scope?.type).toBe('GOAL');
  });

  it('leaves text whole when the word names no available type', () => {
    expect(parseScope('q3: review', FINDER_SCOPES)).toEqual({ scope: null, text: 'q3: review' });
    expect(parseScope('api: gateway', FINDER_SCOPES)).toEqual({ scope: null, text: 'api: gateway' });
    const home = FINDER_SCOPES.filter((s) => s.type !== 'GOAL');
    expect(parseScope('goal: x', home)).toEqual({ scope: null, text: 'goal: x' });
  });
});

describe('scope suggestions and Tab', () => {
  it('offers the types a word of two letters or more starts', () => {
    expect(scopeSuggestions('pro', FINDER_SCOPES).map((s) => s.type)).toEqual(['PROJECT']);
    expect(scopeSuggestions('pe', FINDER_SCOPES).map((s) => s.type)).toEqual(['PERSON']);
    expect(scopeSuggestions('p', FINDER_SCOPES)).toEqual([]);
    expect(scopeSuggestions('pro api', FINDER_SCOPES)).toEqual([]);
  });

  it('completes a word to its keyword and colon, also after /search', () => {
    expect(completeScope('pro', FINDER_SCOPES)).toBe('project: ');
    expect(completeScope('peo', FINDER_SCOPES)).toBe('people: ');
    expect(completeScope('pa', FINDER_SCOPES)).toBe('page: ');
    expect(completeScope('/search to', FINDER_SCOPES)).toBe('/search todo: ');
    expect(completeScope('dana', FINDER_SCOPES)).toBeNull();
    expect(completeScope('pro api', FINDER_SCOPES)).toBeNull();
  });
});

describe('autocompleteRows with types', () => {
  const typed: readonly FinderEntry[] = [
    ...entries,
    { id: 'DOC:d1', name: 'Console runbook', scope: 'DOC', meta: 'Doc', href: '/app/groups/1?doc=d1' }
  ];

  it('narrows names to the type, listing them all before anything follows the colon', () => {
    expect(keys(autocompleteRows('project: cons', typed, FINDER_SCOPES))).toEqual(['PROJECT:1', 'PROJECT:2']);
    expect(keys(autocompleteRows('doc:', typed, FINDER_SCOPES))).toEqual(['DOC:d1']);
    expect(keys(autocompleteRows('group: migr', typed, FINDER_SCOPES))).toEqual([]);
  });

  it('offers a type after the names a word matches, so Enter still opens a name', () => {
    expect(keys(autocompleteRows('pro', typed, FINDER_SCOPES))).toEqual(['scope:PROJECT']);
    const prod = [...typed, { id: 'PROJECT:9', name: 'Prod launch', scope: 'PROJECT', meta: 'Project' }];
    expect(keys(autocompleteRows('pro', prod, FINDER_SCOPES))).toEqual(['PROJECT:9', 'scope:PROJECT']);
    expect(keys(autocompleteRows('con', typed, FINDER_SCOPES)).some((k) => k.startsWith('scope:'))).toBe(false);
  });
});

describe('docEntries and todoEntries', () => {
  it('opens a doc on its entity and names that entity', () => {
    expect(docEntries([{ id: 'd1', title: 'Runbook', entityName: 'Platform', path: '/app/groups/g1?doc=d1' }])).toEqual([
      { id: 'DOC:d1', name: 'Runbook', scope: 'DOC', meta: 'Doc · Platform', href: '/app/groups/g1?doc=d1' }
    ]);
  });

  it('lists open todos first and opens each in the todo popup', () => {
    const todos = [
      { id: 't1', title: 'Done thing', status: 'COMPLETE', entityLabel: 'Ada' },
      { id: 't2', title: 'Open thing', status: 'PENDING', entityLabel: null }
    ];
    expect(todoEntries(todos)).toEqual([
      { id: 'TODO:t2', name: 'Open thing', scope: 'TODO', meta: 'Todo', href: '/app/todos?popup=todo&todo=t2' },
      { id: 'TODO:t1', name: 'Done thing', scope: 'TODO', meta: 'Todo · done · Ada', href: '/app/todos?popup=todo&todo=t1' }
    ]);
  });
});

describe('group kinds as scopes', () => {
  const kinds = [
    { key: 'TEAM', name: 'Team', plural: 'Teams' },
    { key: 'DEPARTMENT', name: 'Department', plural: 'Departments' },
    { key: 'FAMILY', name: 'Family', plural: 'Families' },
    { key: 'WIKI', name: 'Page', plural: 'Pages' }
  ];
  const scopes = [...FINDER_SCOPES, ...groupKindScopes(kinds)];
  const grouped: readonly FinderEntry[] = [
    { id: 'GROUP:t1', name: 'Platform', scope: 'GROUP', meta: 'Team', groupKind: 'TEAM' },
    { id: 'GROUP:d1', name: 'Platform engineering', scope: 'GROUP', meta: 'Department', groupKind: 'DEPARTMENT' },
    { id: 'GROUP:f1', name: 'Smiths', scope: 'GROUP', meta: 'Family', groupKind: 'FAMILY' },
    { id: 'PROJECT:p1', name: 'Platform rebuild', scope: 'PROJECT', meta: 'Project' }
  ];

  it('makes a scope per kind from its name and plural, leaving out words already taken', () => {
    expect(groupKindScopes(kinds)).toEqual([
      { type: 'GROUP', label: 'Teams', keywords: ['team', 'teams'], groupKind: 'TEAM' },
      { type: 'GROUP', label: 'Departments', keywords: ['department', 'departments'], groupKind: 'DEPARTMENT' },
      { type: 'GROUP', label: 'Families', keywords: ['family', 'families'], groupKind: 'FAMILY' },
      { type: 'GROUP', label: 'Pages', keywords: ['pages'], groupKind: 'WIKI' }
    ]);
    expect(groupKindScopes([{ key: 'FRIEND_GROUP', name: 'Friend group', plural: 'Friend groups' }])[0]!.keywords).toEqual(['friendgroup', 'friendgroups']);
  });

  it('narrows to one kind of group', () => {
    expect(parseScope('team: plat', scopes)).toMatchObject({ scope: { groupKind: 'TEAM' }, text: 'plat' });
    expect(parseScope('dep: plat', scopes)).toMatchObject({ scope: { groupKind: 'DEPARTMENT' } });
    expect(parseScope('families: smith', scopes)).toMatchObject({ scope: { groupKind: 'FAMILY' } });
    expect(keys(autocompleteRows('team: plat', grouped, scopes))).toEqual(['GROUP:t1']);
    expect(keys(autocompleteRows('department:', grouped, scopes))).toEqual(['GROUP:d1']);
    expect(keys(autocompleteRows('group: plat', grouped, scopes))).toEqual(['GROUP:t1', 'GROUP:d1']);
  });

  it('keeps the fixed keywords first', () => {
    expect(parseScope('page: x', scopes).scope).toMatchObject({ type: 'PAGE' });
    expect(parseScope('d: x', scopes).scope).toMatchObject({ type: 'DOC' });
    expect(parseScope('t: x', scopes).scope).toMatchObject({ type: 'TODO' });
  });

  it('offers and completes a kind keyword', () => {
    expect(keys(autocompleteRows('tea', grouped, scopes))).toEqual(['scope:GROUP:TEAM']);
    expect(completeScope('tea', scopes)).toBe('team: ');
    expect(completeScope('/search fam', scopes)).toBe('/search family: ');
  });

  it('matches entries of the scope type, and of the kind when it has one', () => {
    const team = scopes.find((s) => s.groupKind === 'TEAM')!;
    const groups = scopes.find((s) => s.type === 'GROUP' && !s.groupKind)!;
    expect(inScope(grouped[0]!, team)).toBe(true);
    expect(inScope(grouped[1]!, team)).toBe(false);
    expect(inScope(grouped[1]!, groups)).toBe(true);
  });
});

describe('finderHierarchy', () => {
  it('gives the parents, top first, and how many sit under it', () => {
    expect(finderHierarchy({ scope: 'PAGE', parents: ['Eng', 'Platform'], children: ['A', 'B', 'C'] })).toEqual({
      trail: ['Eng', 'Platform'],
      children: { count: 3, label: '3 sub-pages' }
    });
    expect(finderHierarchy({ scope: 'PROJECT', children: ['A'] }).children?.label).toBe('1 sub-project');
    expect(finderHierarchy({ scope: 'GOAL' })).toEqual({ trail: [], children: null });
    expect(finderHierarchy({ scope: 'PERSON' })).toEqual({ trail: [], children: null });
  });
});
