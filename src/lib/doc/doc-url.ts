import { get } from 'svelte/store';
import { page } from '$app/stores';
import { goto } from '$app/navigation';

// The doc open in an entity page's centre pane is URL-driven: `?doc=<id>`, or
// `?doc=new` for a draft. Opening one pushes a history entry, so Back closes it.

export const DOC_PARAM = 'doc';
export const NEW_DOC = 'new';

export interface DocUrlOptions {
  /** Replace the current history entry instead of pushing one. */
  readonly replace?: boolean;
}

export const openDocUrl = (id: string, opts: DocUrlOptions = {}): Promise<void> => {
  const url = new URL(get(page).url);
  url.searchParams.set(DOC_PARAM, id);
  url.searchParams.delete('popup');
  return goto(url.toString(), { replaceState: opts.replace ?? false, noScroll: true, keepFocus: true });
};

export const closeDocUrl = (opts: DocUrlOptions = {}): Promise<void> => {
  const url = new URL(get(page).url);
  if (!url.searchParams.has(DOC_PARAM)) return Promise.resolve();
  url.searchParams.delete(DOC_PARAM);
  return goto(url.toString(), { replaceState: opts.replace ?? false, noScroll: true, keepFocus: true });
};
