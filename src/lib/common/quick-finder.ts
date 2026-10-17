// What the ⌘K finder lists. Typing autocompletes entity names; Enter with no
// match searches titles word by word. Two commands start with "/": "/search …"
// searches the full text and "/ask …" asks Claude (both Remry Pro). A partly
// typed command completes with Tab, and "/s …" or "/a …" works as written.
// A type keyword and a colon narrows to one type ("project: api", "pro: api",
// "/search todo: invoice"): names of that type, and on Enter its titles and its
// full text. A word that starts a keyword is offered as a row and completes with Tab.

import { searchOptions, type SearchOption } from '$lib/ui/search-picker';
import type { SearchHit } from '$shared/types/search';
import { typedIdValue } from '$shared/utils/entity';

export interface FinderEntry extends SearchOption {
  /** Shown beside the name: the entity's type. */
  readonly meta: string;
  /** Where it opens, for what has no page of its own (a doc, a todo); else its entity's page. */
  readonly href?: string;
}

/** The finder's `doc:` entries, from `doc.titles`: each opens on its entity's page. */
export const docEntries = (
  docs: readonly { readonly id: string; readonly title: string; readonly entityName: string | null; readonly path: string }[]
): readonly FinderEntry[] =>
  docs.map((d) => ({ id: `DOC:${d.id}`, name: d.title, scope: 'DOC', meta: d.entityName ? `Doc · ${d.entityName}` : 'Doc', href: d.path }));

/** The finder's `todo:` entries, from `todo.list`: open ones first, each opening in the todo popup. */
export const todoEntries = (
  todos: readonly { readonly id: string; readonly title: string; readonly status: string; readonly entityLabel: string | null }[]
): readonly FinderEntry[] => {
  const closed = (status: string): boolean => status === 'COMPLETE' || status === 'CANCELLED';
  return [...todos.filter((t) => !closed(t.status)), ...todos.filter((t) => closed(t.status))].map((t) => ({
    id: `TODO:${t.id}`,
    name: t.title,
    scope: 'TODO',
    meta: ['Todo', t.status === 'COMPLETE' ? 'done' : t.status === 'CANCELLED' ? 'cancelled' : null, t.entityLabel].filter(Boolean).join(' · '),
    href: `/app/todos?popup=todo&todo=${encodeURIComponent(t.id)}`
  }));
};

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

/** The types a query can narrow to. */
export type FinderScopeType = 'PERSON' | 'GROUP' | 'PROJECT' | 'GOAL' | 'PAGE' | 'DOC' | 'TODO';

export interface FinderScope {
  readonly type: FinderScopeType;
  /** What the finder says it's searching: "Projects". */
  readonly label: string;
  /** Typed before the colon; the first is what Tab completes to. */
  readonly keywords: readonly string[];
}

/** In this order a short prefix picks among several ("p:" is people, "pr:" projects, "pa:" pages). */
export const FINDER_SCOPES: readonly FinderScope[] = [
  { type: 'PERSON', label: 'People', keywords: ['person', 'people'] },
  { type: 'GROUP', label: 'Groups', keywords: ['group'] },
  { type: 'PROJECT', label: 'Projects', keywords: ['project'] },
  { type: 'GOAL', label: 'Goals', keywords: ['goal'] },
  { type: 'PAGE', label: 'Wiki pages', keywords: ['wiki', 'page'] },
  { type: 'DOC', label: 'Docs', keywords: ['doc'] },
  { type: 'TODO', label: 'Todos', keywords: ['todo'] }
];

/** Whether a typed word names a keyword: a prefix of it ("pro"), or it plus "s" ("projects"). */
const namesKeyword = (word: string, keyword: string): boolean => keyword.startsWith(word) || word === `${keyword}s`;

/** The first of `available` scopes a typed word names, or null. */
const scopeFor = (word: string, available: readonly FinderScope[]): FinderScope | null =>
  word ? available.find((s) => s.keywords.some((k) => namesKeyword(word.toLowerCase(), k))) ?? null : null;

export interface ScopedText {
  /** The type the text is narrowed to, or null. */
  readonly scope: FinderScope | null;
  /** What to look for, without the keyword. */
  readonly text: string;
}

/**
 * Reads a keyword and a colon at the start ("project: api" → projects, "api"). A word that
 * names no available type ("q3: review") isn't a keyword, so the text stays whole.
 */
export const parseScope = (text: string, available: readonly FinderScope[]): ScopedText => {
  const match = /^\s*([a-z]+):\s*([\s\S]*)$/i.exec(text);
  const scope = match ? scopeFor(match[1]!, available) : null;
  return scope ? { scope, text: match![2]! } : { scope: null, text };
};

/** Scopes a single word being typed could start ("pro" → Projects), offered before its colon. Nothing for one letter. */
export const scopeSuggestions = (text: string, available: readonly FinderScope[]): readonly FinderScope[] => {
  const word = text.trim().toLowerCase();
  if (word.length < 2 || !/^[a-z]+$/.test(word) || text !== text.trimStart()) return [];
  return available.filter((s) => s.keywords.some((k) => k.startsWith(word)));
};

/** Tab on a word that starts a keyword fills it in with its colon ("pro" → "project: "), else null. */
export const completeScope = (query: string, available: readonly FinderScope[], active = 0): string | null => {
  const [prefix, word] = query.startsWith('/') ? (/^(\/\S+\s+)(\S*)$/.exec(query) ?? []).slice(1) : ['', query];
  if (word === undefined || prefix === undefined || !/^[a-z]+$/i.test(word)) return null;
  const options = available.filter((s) => s.keywords.some((k) => k.startsWith(word.toLowerCase())));
  const scope = options[active] ?? options[0];
  if (!scope) return null;
  const keyword = scope.keywords.find((k) => k.startsWith(word.toLowerCase())) ?? scope.keywords[0]!;
  return `${prefix}${keyword}: `;
};

export type FinderRow =
  | { readonly kind: 'scope'; readonly key: string; readonly scope: FinderScope }
  | { readonly kind: 'command'; readonly key: string; readonly command: FinderCommand }
  | { readonly kind: 'entry'; readonly key: string; readonly entry: FinderEntry }
  | { readonly kind: 'hit'; readonly key: string; readonly hit: SearchHit };

export const commandRows = (commands: readonly FinderCommand[]): readonly FinderRow[] =>
  commands.map((command) => ({ kind: 'command', key: `command:${command.id}`, command }));

const entryRows = (entries: readonly FinderEntry[]): readonly FinderRow[] =>
  entries.map((entry) => ({ kind: 'entry', key: entry.id, entry }));

/**
 * Rows while typing names: the commands before anything is typed, then names matching the
 * text, then the types the word could narrow to (after the names, so Enter still opens a name).
 * Narrowed to a type, its names: all of them (up to `limit`) before anything follows the colon.
 */
export const autocompleteRows = (
  text: string,
  entries: readonly FinderEntry[],
  available: readonly FinderScope[] = [],
  limit = 12
): readonly FinderRow[] => {
  const { scope, text: rest } = parseScope(text, available);
  if (scope) return entryRows(searchOptions(entries.filter((e) => e.scope === scope.type), rest, null, limit));
  if (!text.trim()) return commandRows(FINDER_COMMANDS);
  const scopes = scopeSuggestions(text, available).map((s): FinderRow => ({ kind: 'scope', key: `scope:${s.type}`, scope: s }));
  return [...entryRows(searchOptions(entries, text, null, limit)), ...scopes];
};

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
