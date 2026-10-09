// Matching for SearchPicker: a plain query searches every option, and a query
// starting with "/" names a scope (a type) to search within. The query stays
// plain text: "/team console" is parsed each time, never turned into a chip.

export interface SearchOption {
  readonly id: string;
  readonly name: string;
  readonly scope?: string;
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

/** Options in `scope` (every scope when null) whose name contains the query, names that start with it first. */
export const searchOptions = <T extends SearchOption>(
  options: readonly T[],
  query: string,
  scope: string | null,
  limit = 8
): readonly T[] => {
  const q = query.trim().toLowerCase();
  const inScope = scope === null ? options : options.filter((o) => o.scope === scope);
  if (!q) return inScope.slice(0, limit);
  const starts: T[] = [];
  const contains: T[] = [];
  for (const option of inScope) {
    const name = option.name.toLowerCase();
    if (name.startsWith(q)) starts.push(option);
    else if (name.includes(q)) contains.push(option);
  }
  return [...starts, ...contains].slice(0, limit);
};
