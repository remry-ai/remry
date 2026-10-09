// What the ⌘K finder lists for a query. Queries read like SearchPicker's
// ("/team console" searches teams, "/pro " completes to "/project "), and the
// "/" list also holds commands: "/todo" runs one instead of scoping the search.

import { matchScopes, parseSearchQuery, searchOptions, type SearchOption, type SearchScope } from '$lib/ui/search-picker';

export interface FinderEntry extends SearchOption {
  /** Shown beside the name: the entity's type, "Go to" or "Notebook". */
  readonly meta: string;
}

export type FinderRow =
  | { readonly kind: 'scope'; readonly key: string; readonly scope: SearchScope }
  | { readonly kind: 'command'; readonly key: string; readonly command: SearchScope }
  | { readonly kind: 'entry'; readonly key: string; readonly entry: FinderEntry };

export interface FinderSources {
  readonly scopes: readonly SearchScope[];
  /** Run from the "/" list; each `label` says what it does. */
  readonly commands: readonly SearchScope[];
  /** Everything searchable. Entries without a scope (app sections, notebooks) only match an unscoped search. */
  readonly entries: readonly FinderEntry[];
  /** Listed, after the commands, before anything is typed. */
  readonly home: readonly FinderEntry[];
}

const scopeRows = (scopes: readonly SearchScope[]): readonly FinderRow[] =>
  scopes.map((scope) => ({ kind: 'scope', key: `scope:${scope.id}`, scope }));

const commandRows = (commands: readonly SearchScope[]): readonly FinderRow[] =>
  commands.map((command) => ({ kind: 'command', key: `command:${command.id}`, command }));

const entryRows = (entries: readonly FinderEntry[]): readonly FinderRow[] =>
  entries.map((entry) => ({ kind: 'entry', key: entry.id, entry }));

export const finderRows = (query: string, sources: FinderSources, limit = 12): readonly FinderRow[] => {
  if (!query.trim()) return [...commandRows(sources.commands), ...entryRows(sources.home)];
  const parsed = parseSearchQuery(query, sources.scopes);
  if (parsed.scopes) return [...scopeRows(parsed.scopes), ...commandRows(matchScopes(query, sources.commands) ?? [])];
  return entryRows(searchOptions(sources.entries, parsed.text, parsed.scope?.id ?? null, limit));
};
