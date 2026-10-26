import { describe, it, expect } from 'vitest';
import { completeScopeWord, matchScopes, nameMatchRank, optionMatchRank, parseSearchQuery, searchOptions, typedScope } from '../search-picker';

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

describe('nameMatchRank', () => {
  it('matches words in any order, at the start of any word', () => {
    expect(nameMatchRank('Paperwall expenses', 'expenses')).not.toBeNull();
    expect(nameMatchRank('Paperwall expenses', 'exp paper')).not.toBeNull();
    expect(nameMatchRank('Q3 platform review', 'review q3')).not.toBeNull();
  });

  it('ignores case, accents and punctuation', () => {
    expect(nameMatchRank('Café-Ops rota', 'cafe ops')).not.toBeNull();
    expect(nameMatchRank("Dana's 1:1 notes", 'danas 1:1')).not.toBeNull();
    expect(nameMatchRank("Dana's 1:1 notes", 'notes dana')).not.toBeNull();
  });

  it('matches initials', () => {
    expect(nameMatchRank('Paperwall expenses', 'pe')).not.toBeNull();
    expect(nameMatchRank('Paperwall expenses', 'px')).toBeNull();
  });

  it('ranks the name\'s start, then a word\'s start, then any order, then inside a word', () => {
    const rank = (name: string): number | null => nameMatchRank(name, 'pay');
    expect(rank('Pay')).toBe(0);
    expect(rank('Payments')).toBe(1);
    expect(rank('Team payments')).toBe(2);
    expect(rank('Prepay')).toBe(4);
    expect(nameMatchRank('Migrate the web console', 'web migr')).toBe(3);
  });

  it('needs every word', () => {
    expect(nameMatchRank('Paperwall expenses', 'paper rent')).toBeNull();
  });
});

describe('searchOptions ranking', () => {
  const named = (...names: string[]) => names.map((name, i) => ({ id: String(i), name }));
  it('puts better matches first and keeps the given order within a rank', () => {
    const opts = named('Prepay', 'Team payments', 'Payroll', 'Pay', 'Payments');
    expect(searchOptions(opts, 'pay', null).map((o) => o.name)).toEqual(['Pay', 'Payroll', 'Payments', 'Team payments', 'Prepay']);
  });

  it('finds a title by a later word', () => {
    expect(searchOptions(named('Paperwall expenses', 'Rent'), 'expenses', null).map((o) => o.name)).toEqual(['Paperwall expenses']);
  });
});
describe('optionMatchRank', () => {
  it('matches the parents\' titles after any match on the name alone', () => {
    const child = { id: 'c', name: 'Launch plan', parents: ['Q3', 'Platform'] };
    expect(optionMatchRank(child, 'launch')).toBe(1);
    expect(optionMatchRank(child, 'platform launch')).not.toBeNull();
    expect(optionMatchRank(child, 'platform launch')!).toBeGreaterThan(6);
    expect(optionMatchRank({ id: 'x', name: 'Launch plan' }, 'platform launch')).toBeNull();
  });

  it('ranks an option named for the query above one whose parent is', () => {
    const options = [
      { id: 'child', name: 'Notes', parents: ['Budget'] },
      { id: 'top', name: 'Budget' }
    ];
    expect(searchOptions(options, 'budget', null).map((o) => o.id)).toEqual(['top', 'child']);
  });
});

describe('optionMatchRank with children', () => {
  it('matches a parent by a child\'s title, after name and parent matches', () => {
    const parent = { id: 'p', name: 'Platform', children: ['Launch plan', 'Budget'] };
    expect(optionMatchRank(parent, 'launch')).toBeGreaterThanOrEqual(20);
    expect(optionMatchRank(parent, 'platform budget')).toBeGreaterThanOrEqual(20);
    expect(optionMatchRank(parent, 'hiring')).toBeNull();
  });

  it('lists the item named for the query, then one under a matching parent, then the parent', () => {
    const options = [
      { id: 'parent', name: 'Platform', children: ['Launch plan'] },
      { id: 'grandchild', name: 'Notes', parents: ['Launch plan'] },
      { id: 'child', name: 'Launch plan', parents: ['Platform'], children: ['Notes'] }
    ];
    expect(searchOptions(options, 'launch', null).map((o) => o.id)).toEqual(['child', 'grandchild', 'parent']);
  });
});

describe('searchOptions narrowing', () => {
  // A seeded generator, so a failure repeats.
  const random = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const WORDS = ['launch', 'plan', 'Platform', 'café', 'q3', 'Dana\'s', 'road-map', 'paper', 'expenses', 'pe', 'la'];

  it('gives what a fresh search gives, while typing, deleting and switching scope', () => {
    const next = random(42);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
    const name = () => Array.from({ length: 1 + Math.floor(next() * 3) }, () => pick(WORDS)).join(' ');
    const options = Array.from({ length: 300 }, (_, i) => ({
      id: `o${i}`,
      name: name(),
      scope: pick(['PAGE', 'PROJECT']),
      ...(next() < 0.4 && { parents: [name(), name()] }),
      ...(next() < 0.4 && { children: [name(), name()] })
    }));
    const fresh = (query: string, scope: string | null) => searchOptions([...options], query, scope, 500).map((o) => o.id);

    for (let run = 0; run < 200; run++) {
      const target = `${pick(WORDS)}${next() < 0.5 ? ` ${pick(WORDS)}` : ''}`;
      const scope = next() < 0.3 ? pick(['PAGE', 'PROJECT']) : null;
      // Type it letter by letter, then delete back a few.
      const typed = [...target].map((_, i) => target.slice(0, i + 1));
      const deleted = typed.slice(0, -1).reverse().slice(0, 3);
      for (const query of [...typed, ...deleted]) {
        expect(searchOptions(options, query, scope, 500).map((o) => o.id), `${JSON.stringify(query)} in ${scope}`).toEqual(fresh(query, scope));
      }
    }
  });

  it('checks only the last matches when the query grows', () => {
    let reads = 0;
    const options = Array.from({ length: 1000 }, (_, i) => {
      const value = i < 10 ? `Launch plan ${i}` : `Budget ${i}`;
      return { id: `o${i}`, get name() { reads++; return value; } };
    });
    searchOptions(options, 'la', null);
    reads = 0;
    searchOptions(options, 'lau', null);
    expect(reads).toBeLessThanOrEqual(10 * 2);

    // A shorter query searches them all again.
    reads = 0;
    searchOptions(options, 'l', null);
    expect(reads).toBeGreaterThanOrEqual(1000);
  });
});
