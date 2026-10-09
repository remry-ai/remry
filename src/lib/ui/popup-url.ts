import { get } from 'svelte/store';
import { page } from '$app/stores';
import { goto } from '$app/navigation';

// Popups are URL-driven: `?popup=<id>` opens the <Popup id> on the page.

export const openPopup = (id: string, extra?: Readonly<Record<string, string>>): Promise<void> => {
  const url = new URL(get(page).url);
  url.searchParams.set('popup', id);
  for (const [k, v] of Object.entries(extra ?? {})) url.searchParams.set(k, v);
  return goto(url.toString(), { replaceState: true, noScroll: true });
};

export interface ClosePopupOptions {
  readonly invalidate?: boolean;
  readonly clear?: readonly string[];
}

export const closePopup = (opts: ClosePopupOptions = {}): Promise<void> => {
  const url = new URL(get(page).url);
  url.searchParams.delete('popup');
  for (const k of opts.clear ?? []) url.searchParams.delete(k);
  return goto(url.toString(), {
    replaceState: true,
    noScroll: true,
    invalidateAll: opts.invalidate ?? false,
  });
};
