import { get } from 'svelte/store';
import { page } from '$app/stores';
import { goto } from '$app/navigation';

// A side peek is URL-driven: `?peek=<id>` opens the <SidePeek> on the page.
// Opening the first one pushes a history entry, so Back closes it; peeking at
// another while one is open replaces it, so Back doesn't step through them all.

export const PEEK_PARAM = 'peek';

/** The current URL with the peek set to `id`, or removed for null. Every other param stays. */
export const peekHref = (url: URL, id: string | null, param: string = PEEK_PARAM): string => {
  const next = new URL(url);
  if (id === null) next.searchParams.delete(param);
  else next.searchParams.set(param, id);
  return `${next.pathname}${next.search}${next.hash}`;
};

export const openPeek = (id: string, param: string = PEEK_PARAM): Promise<void> => {
  const url = get(page).url;
  return goto(peekHref(url, id, param), { replaceState: url.searchParams.has(param), noScroll: true, keepFocus: true });
};

export const closePeek = (param: string = PEEK_PARAM): Promise<void> => {
  const url = get(page).url;
  if (!url.searchParams.has(param)) return Promise.resolve();
  return goto(peekHref(url, null, param), { replaceState: true, noScroll: true, keepFocus: true });
};
