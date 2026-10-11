import { readable, type Readable } from 'svelte/store';

/** Whether a media query matches, kept current as the window changes. False on the server. */
export const mediaQuery = (query: string): Readable<boolean> =>
  readable(false, (set) => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const list = window.matchMedia(query);
    set(list.matches);
    const update = (e: MediaQueryListEvent) => set(e.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  });
