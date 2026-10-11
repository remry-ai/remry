import { get, writable, type Writable } from 'svelte/store';
import { parseStoredWidth } from '$lib/common/panel-width';
import { toggledActive, type ActiveDrawer, type DrawerSide } from '$lib/common/drawer-state';
import { mediaQuery } from '$lib/stores/media';

// The left drawer (an entity page's sidebar, `DetailLayout`) and the right one
// (`RightPanel`). Each floats over the page below its own breakpoint and is
// docked beside it otherwise; both can always be toggled and resized.

// Not mixins: these are shell breakpoints, and the drawers' CSS repeats them as
// media queries so the first paint is right before these stores run. The three-column detail layout needs
// ~850px before the sidebar floats; the right panel fits beside list pages from
// ~1150px and beside detail pages from 768px.
export const leftFloating = mediaQuery('(max-width: 849px)');
export const belowMd = mediaQuery('(max-width: 767px)');
export const belowPanelFit = mediaQuery('(max-width: 1149px)');

/** The floating drawer that's open, if any. */
export const activeDrawer = writable<ActiveDrawer>(null);

/** Set by `DetailLayout` while the page has a left drawer, for the top bar's toggle. */
export const leftDrawer = writable<{ readonly label: string } | null>(null);

// Per-browser preferences, so localStorage is enough.
const read = <T>(key: string, parse: (raw: string | null) => T, fallback: T): T => {
  try {
    return typeof localStorage === 'undefined' ? fallback : parse(localStorage.getItem(key));
  } catch {
    return fallback;
  }
};

// The first paint can't wait for these stores: `src/app.html` copies them onto
// <html> before it (`data-*-closed`, `--*-drag-w`), and the CSS reads them there.
const mirror = (apply: (root: HTMLElement) => void): void => {
  if (typeof document !== 'undefined') apply(document.documentElement);
};

const persisted = <T>(
  key: string,
  parse: (raw: string | null) => T,
  fallback: T,
  serialise: (v: T) => string | null,
  onRoot: (root: HTMLElement, v: T) => void,
): Writable<T> => {
  const store = writable<T>(read(key, parse, fallback));
  store.subscribe((value) => {
    mirror((root) => onRoot(root, value));
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = serialise(value);
      if (raw === null) localStorage.removeItem(key);
      else localStorage.setItem(key, raw);
    } catch { /* storage unavailable: it lasts this session only */ }
  });
  return store;
};

const parseOpen = (raw: string | null): boolean => raw !== 'false';
const persistedOpen = (key: string, closedAttr: string): Writable<boolean> =>
  persisted(key, parseOpen, true, (v) => (v ? null : 'false'), (root, open) => root.toggleAttribute(closedAttr, !open));
const persistedWidth = (key: string, cssVar: string): Writable<number | null> =>
  persisted(key, parseStoredWidth, null, (v) => (v === null ? null : String(v)), (root, width) => {
    if (width === null) root.style.removeProperty(cssVar);
    else root.style.setProperty(cssVar, `${width}px`);
  });

/** Whether each drawer is open while docked. */
export const leftDocked = persistedOpen('remry:left-open', 'data-left-closed');
export const rightDocked = persistedOpen('remry:right-open', 'data-right-closed');

/** Widths in px once the user has dragged an edge, or null for the default (`--sidebar-w`, `--panel-w`). */
export const sidebarWidth = persistedWidth('remry:sidebar-width', '--sidebar-drag-w');
export const panelWidth = persistedWidth('remry:panel-width', '--panel-drag-w');

const dockedStore = (side: DrawerSide): Writable<boolean> => (side === 'left' ? leftDocked : rightDocked);

/** Show or hide a drawer in its current mode. */
export const toggleDrawer = (side: DrawerSide, floating: boolean): void => {
  if (floating) activeDrawer.update((active) => toggledActive(side, active));
  else dockedStore(side).update((open) => !open);
};

/** Show a drawer in its current mode. */
export const openDrawer = (side: DrawerSide, floating: boolean): void => {
  if (floating) activeDrawer.set(side);
  else dockedStore(side).set(true);
};

/** Close a floating drawer; a docked one stays as the user left it. */
export const closeFloating = (side: DrawerSide): void => {
  if (get(activeDrawer) === side) activeDrawer.set(null);
};
