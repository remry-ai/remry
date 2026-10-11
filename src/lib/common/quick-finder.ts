// What the ⌘K finder lists. Typing autocompletes names; Enter with no match
// submits the query: a title search (every word, in any order) and, with
// Remry Pro, full-text results under the title matches.

import { searchOptions, type SearchOption } from '$lib/ui/search-picker';
import type { SearchHit } from '$shared/types/search';
import { typedIdValue } from '$shared/utils/entity';

export interface FinderEntry extends SearchOption {
  /** Shown beside the name: the entity's type, "Go to" or "Notebook". */
  readonly meta: string;
}

export type FinderRow =
  | { readonly kind: 'entry'; readonly key: string; readonly entry: FinderEntry }
  | { readonly kind: 'hit'; readonly key: string; readonly hit: SearchHit };

const entryRows = (entries: readonly FinderEntry[]): readonly FinderRow[] =>
  entries.map((entry) => ({ kind: 'entry', key: entry.id, entry }));

/** Rows while typing: `home` before anything is typed, then names containing the query. */
export const autocompleteRows = (
  query: string,
  entries: readonly FinderEntry[],
  home: readonly FinderEntry[],
  limit = 12
): readonly FinderRow[] =>
  query.trim() ? entryRows(searchOptions(entries, query, null, limit)) : entryRows(home);

/** Entries whose name holds every word of the query, in any order; names starting with the query first. */
export const titleMatches = (entries: readonly FinderEntry[], query: string, limit = 12): readonly FinderEntry[] => {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const matches = entries.filter((e) => {
    const name = e.name.toLowerCase();
    return words.every((w) => name.includes(w));
  });
  const starts = matches.filter((e) => e.name.toLowerCase().startsWith(q));
  return [...starts, ...matches.filter((e) => !starts.includes(e))].slice(0, limit);
};

/** Rows for a submitted query: the title matches, then full-text hits that aren't one of them. */
export const submittedRows = (titles: readonly FinderEntry[], hits: readonly SearchHit[]): readonly FinderRow[] => {
  const shown = new Set(titles.map((t) => t.id));
  const rest = hits.filter((hit) => !shown.has(typedIdValue(hit.entityType, hit.entityId)));
  return [...entryRows(titles), ...rest.map((hit): FinderRow => ({ kind: 'hit', key: `hit:${hit.entityType}:${hit.entityId}`, hit }))];
};

export interface SnippetPart {
  readonly text: string;
  readonly match: boolean;
}

/** Splits a search snippet ("a **match** here") into plain and matched text, for rendering without HTML. */
export const snippetParts = (snippet: string): readonly SnippetPart[] =>
  snippet
    .split(/\*\*(.+?)\*\*/)
    .map((text, i) => ({ text, match: i % 2 === 1 }))
    .filter((part) => part.text !== '');
