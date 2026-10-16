import { get } from 'svelte/store';
import { page } from '$app/stores';
import { goto } from '$app/navigation';
import { showPeekTab } from '$lib/stores/drawers';

// A side peek is URL-driven: `?peek=<id>` (or `?peek=<TYPE>:<id>`) opens the <SidePeek> on the page.
// Opening the first one pushes a history entry, so Back closes it; peeking at
// another while one is open replaces it, so Back doesn't step through them all.

export const PEEK_PARAM = 'peek';

/**
 * What a peek can show. A list page holds one type, so its peek is just `?peek=<id>`; a detail
 * page lists several (docs, sub-projects, goals, people), so its peeks say which:
 * `?peek=PROJECT:<id>` (`peekValue`). `parsePeek` reads either form.
 */
export const PEEK_TYPES = ['PROJECT', 'PAGE', 'GOAL', 'PERSON', 'DOC'] as const;
export type PeekType = (typeof PEEK_TYPES)[number];

export interface PeekTarget {
  /** Null for a list page's plain `?peek=<id>`. */
  readonly type: PeekType | null;
  readonly id: string;
}

export const isPeekType = (type: string): type is PeekType => (PEEK_TYPES as readonly string[]).includes(type);

export const peekValue = (type: PeekType, id: string): string => `${type}:${id}`;

/** A peek param's value as its type and id, or null when there's none (or it's empty). */
export const parsePeek = (value: string | null): PeekTarget | null => {
  if (!value) return null;
  const colon = value.indexOf(':');
  if (colon < 0) return { type: null, id: value };
  const type = value.slice(0, colon);
  const id = value.slice(colon + 1);
  if (!id) return null;
  return (PEEK_TYPES as readonly string[]).includes(type) ? { type: type as PeekType, id } : { type: null, id: value };
};

/** The current URL with the peek set to `id`, or removed for null. Every other param stays. */
export const peekHref = (url: URL, id: string | null, param: string = PEEK_PARAM): string => {
  const next = new URL(url);
  if (id === null) next.searchParams.delete(param);
  else next.searchParams.set(param, id);
  return `${next.pathname}${next.search}${next.hash}`;
};

/** Open a peek, showing the right panel even if the user had closed it (or the same peek is already open). */
export const openPeek = (id: string, param: string = PEEK_PARAM): Promise<void> => {
  const url = get(page).url;
  showPeekTab();
  return goto(peekHref(url, id, param), { replaceState: url.searchParams.has(param), noScroll: true, keepFocus: true });
};

export const closePeek = (param: string = PEEK_PARAM): Promise<void> => {
  const url = get(page).url;
  if (!url.searchParams.has(param)) return Promise.resolve();
  return goto(peekHref(url, null, param), { replaceState: true, noScroll: true, keepFocus: true });
};
