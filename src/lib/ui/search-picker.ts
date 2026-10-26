// Matching for SearchPicker: a plain query searches every option, and a query
// starting with "/" names a scope (a type) to search within. The query stays
// plain text: "/team console" is parsed each time, never turned into a chip.

export interface SearchOption {
  readonly id: string;
  readonly name: string;
  readonly scope?: string;
  /** Its parents' titles ("Platform / Q3"): a query matches them too, below matches on the name itself. */
  readonly parents?: string;
}

export interface SearchScope {
  readonly id: string;
  readonly label: string;
  /** The word typed after "/" to pick this scope. */
  readonly slash: string;
}

/** Scopes a "/" query offers: "/" lists them all, "/te" those whose word or label starts with "te". Null for any other query. */
export const matchScopes = (query: string, scopes: readonly SearchScope[]): readonly SearchScope[] | null => {
  if (!query.startsWith('/')) return null;
  const word = query.slice(1).trim().toLowerCase();
  return scopes.filter((s) => s.slash.startsWith(word) || s.label.toLowerCase().startsWith(word));
};

/**
 * The scope a "/" word followed by a space picks ("/pro api"), with the rest of the query:
 * a word typed in full, else the `active` one of the scopes it starts, else the first.
 */
export const typedScope = (
  query: string,
  scopes: readonly SearchScope[],
  active = 0
): { readonly scope: SearchScope; readonly rest: string } | null => {
  const match = /^\/(\S+)\s+(.*)$/.exec(query);
  if (!match) return null;
  const word = match[1]!.toLowerCase();
  const matches = matchScopes(`/${word}`, scopes) ?? [];
  const scope = matches.find((s) => s.slash === word || s.label.toLowerCase() === word) ?? matches[active] ?? matches[0];
  return scope ? { scope, rest: match[2]! } : null;
};

export interface ParsedQuery {
  /** Scopes to offer while a "/" word is still being typed, else null. */
  readonly scopes: readonly SearchScope[] | null;
  /** The scope the query names ("/team …"), else null. */
  readonly scope: SearchScope | null;
  /** What to search names for. */
  readonly text: string;
}

/** Reads a query: "console" searches everything, "/te" offers scopes, "/team console" searches teams. */
export const parseSearchQuery = (query: string, scopes: readonly SearchScope[]): ParsedQuery => {
  if (!query.startsWith('/')) return { scopes: null, scope: null, text: query };
  const typed = typedScope(query, scopes);
  if (typed) return { scopes: null, scope: typed.scope, text: typed.rest };
  return { scopes: /\s/.test(query) ? [] : matchScopes(query, scopes) ?? [], scope: null, text: '' };
};

/** Completes a "/" word the moment a space follows it ("/pro " → "/project "), with the highlighted scope when several match. */
export const completeScopeWord = (query: string, scopes: readonly SearchScope[], active = 0): string => {
  const typed = /^\/\S+\s$/.test(query) ? typedScope(query, scopes, active) : null;
  return typed ? `/${typed.scope.slash} ` : query;
};

/** Lower case, accents and apostrophes dropped, other punctuation as spaces: "Café-Ops" → "cafe ops", "Dana's" → "danas". */
const normalize = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/['’]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * How well a name matches a query, lower is better, or null for no match. Best first: the
 * whole name; the name's start; a word's start; every query word starting a word of the name,
 * in any order ("exp paper" → "Paperwall expenses"); the query anywhere; every query word
 * anywhere; the initials ("pe" → "Paperwall expenses").
 */
export const nameMatchRank = (name: string, query: string): number | null => {
  const q = normalize(query);
  if (!q) return 0;
  const n = normalize(name);
  const nameWords = n.split(' ');
  const queryWords = q.split(' ');
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(` ${q}`)) return 2;
  if (queryWords.every((w) => nameWords.some((nw) => nw.startsWith(w)))) return 3;
  if (n.includes(q)) return 4;
  if (queryWords.every((w) => n.includes(w))) return 5;
  if (!q.includes(' ') && q.length > 1 && nameWords.map((w) => w[0]).join('').startsWith(q)) return 6;
  return null;
};

/** Ranks past every rank `nameMatchRank` gives a name, for a match that needs the parents' titles. */
const PARENT_MATCH_OFFSET = 10;

/**
 * How well an option matches: its name (`nameMatchRank`), else its parents' titles and name
 * together ("q3 launch" → "Launch plan" under "Q3"), ranked after every match on a name.
 */
export const optionMatchRank = (option: SearchOption, query: string): number | null => {
  const rank = nameMatchRank(option.name, query);
  if (rank !== null || !option.parents) return rank;
  const withParents = nameMatchRank(`${option.parents} ${option.name}`, query);
  return withParents === null ? null : withParents + PARENT_MATCH_OFFSET;
};

/** Options in `scope` (every scope when null) that match the query (`optionMatchRank`), best first, in their own order within a rank. */
export const searchOptions = <T extends SearchOption>(
  options: readonly T[],
  query: string,
  scope: string | null,
  limit = 8
): readonly T[] => {
  const inScope = scope === null ? options : options.filter((o) => o.scope === scope);
  if (!query.trim()) return inScope.slice(0, limit);
  return inScope
    .map((option, index) => ({ option, index, rank: optionMatchRank(option, query) }))
    .filter((m): m is { option: T; index: number; rank: number } => m.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((m) => m.option);
};
