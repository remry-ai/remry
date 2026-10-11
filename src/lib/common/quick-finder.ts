// What the ⌘K finder lists. Typing autocompletes entity names; Enter with no
// match searches titles word by word. Two commands start with "/": "/s …"
// searches the full text and "/ask …" asks Claude (both Remry Pro).

import { searchOptions, type SearchOption } from '$lib/ui/search-picker';
import type { SearchHit } from '$shared/types/search';
import { typedIdValue } from '$shared/utils/entity';

export interface FinderEntry extends SearchOption {
  /** Shown beside the name: the entity's type. */
  readonly meta: string;
}

export type FinderCommandId = 's' | 'ask';

export interface FinderCommand {
  readonly id: FinderCommandId;
  readonly label: string;
}

export const FINDER_COMMANDS: readonly FinderCommand[] = [
  { id: 's', label: 'Search the full text' },
  { id: 'ask', label: 'Ask Claude about the notebook' }
];

export type FinderQuery =
  /** Plain text: autocomplete names. */
  | { readonly kind: 'names'; readonly text: string }
  /** A "/" word still being typed: the commands it could be. */
  | { readonly kind: 'commands'; readonly commands: readonly FinderCommand[] }
  /** "/s …" or "/ask …", with what follows. */
  | { readonly kind: FinderCommandId; readonly text: string };

/** Reads a query: "dana" names, "/a" commands, "/s budget" a full-text search, "/ask who owns billing?" a question. */
export const parseFinderQuery = (query: string): FinderQuery => {
  if (!query.startsWith('/')) return { kind: 'names', text: query };
  const match = /^\/(\S*)(\s+([\s\S]*))?$/.exec(query);
  const word = (match?.[1] ?? '').toLowerCase();
  const command = FINDER_COMMANDS.find((c) => c.id === word);
  if (match?.[2] !== undefined) {
    return command ? { kind: command.id, text: match[3] ?? '' } : { kind: 'commands', commands: [] };
  }
  return { kind: 'commands', commands: FINDER_COMMANDS.filter((c) => c.id.startsWith(word)) };
};

export type FinderRow =
  | { readonly kind: 'command'; readonly key: string; readonly command: FinderCommand }
  | { readonly kind: 'entry'; readonly key: string; readonly entry: FinderEntry }
  | { readonly kind: 'hit'; readonly key: string; readonly hit: SearchHit };

export const commandRows = (commands: readonly FinderCommand[]): readonly FinderRow[] =>
  commands.map((command) => ({ kind: 'command', key: `command:${command.id}`, command }));

const entryRows = (entries: readonly FinderEntry[]): readonly FinderRow[] =>
  entries.map((entry) => ({ kind: 'entry', key: entry.id, entry }));

/** Rows while typing names: the commands before anything is typed, then names containing the text. */
export const autocompleteRows = (text: string, entries: readonly FinderEntry[], limit = 12): readonly FinderRow[] =>
  text.trim() ? entryRows(searchOptions(entries, text, null, limit)) : commandRows(FINDER_COMMANDS);

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

/** An app path an answer links to, for the finder to open itself; null for anything else (another site). */
export const appLink = (href: string | null): string | null =>
  href && href.startsWith('/app') ? href : null;
