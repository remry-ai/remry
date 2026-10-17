// What the ⌘K finder lists. Typing autocompletes entity names; Enter with no
// match searches titles word by word. Two commands start with "/": "/search …"
// searches the full text and "/ask …" asks Claude (both Remry Pro). A partly
// typed command completes with Tab, and "/s …" or "/a …" works as written.

import { searchOptions, type SearchOption } from '$lib/ui/search-picker';
import type { SearchHit } from '$shared/types/search';
import { typedIdValue } from '$shared/utils/entity';

export interface FinderEntry extends SearchOption {
  /** Shown beside the name: the entity's type. */
  readonly meta: string;
}

export type FinderCommandId = 'search' | 'ask';

export interface FinderCommand {
  readonly id: FinderCommandId;
  readonly label: string;
}

export const FINDER_COMMANDS: readonly FinderCommand[] = [
  { id: 'search', label: 'Search the full text' },
  { id: 'ask', label: 'Ask Claude about the notebook' }
];

export type FinderQuery =
  /** Plain text: autocomplete names. */
  | { readonly kind: 'names'; readonly text: string }
  /** A "/" word still being typed: the commands it could be. */
  | { readonly kind: 'commands'; readonly commands: readonly FinderCommand[] }
  /** "/search …" or "/ask …", with what follows. */
  | { readonly kind: FinderCommandId; readonly text: string };

/** Commands whose word starts with `word` ("s" → search, "" → all). */
const commandsStarting = (word: string): readonly FinderCommand[] =>
  FINDER_COMMANDS.filter((c) => c.id.startsWith(word.toLowerCase()));

/**
 * Reads a query: "dana" names, "/a" commands, "/search budget" a full-text search,
 * "/ask who owns billing?" a question. A shortened word followed by a space ("/s budget")
 * reads as the first command it starts.
 */
export const parseFinderQuery = (query: string): FinderQuery => {
  if (!query.startsWith('/')) return { kind: 'names', text: query };
  const match = /^\/(\S*)(\s+([\s\S]*))?$/.exec(query);
  const word = match?.[1] ?? '';
  const commands = word ? commandsStarting(word) : FINDER_COMMANDS;
  if (match?.[2] === undefined) return { kind: 'commands', commands };
  const command = word ? commands[0] : undefined;
  return command ? { kind: command.id, text: match[3] ?? '' } : { kind: 'commands', commands: [] };
};

/** Tab on a partly typed command ("/s") fills in the `active` one of those it could be ("/search "). Null when there's nothing to complete. */
export const completeCommand = (query: string, active = 0): string | null => {
  const parsed = parseFinderQuery(query);
  if (parsed.kind !== 'commands') return null;
  const command = parsed.commands[active] ?? parsed.commands[0];
  return command ? `/${command.id} ` : null;
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

/** Entries whose name matches the query, best first (`searchOptions`: words in any order, starts of words first). */
export const titleMatches = (entries: readonly FinderEntry[], query: string, limit = 12): readonly FinderEntry[] =>
  query.trim() ? searchOptions(entries, query, null, limit) : [];

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
