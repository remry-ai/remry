import { writable } from 'svelte/store';

interface LayoutConfig {
  /** Collapse the notes panel into a drawer on medium screens. */
  readonly collapseInfoPanel: boolean;
  /** Drop the notes panel entirely (pages with nothing to show in it). */
  readonly hideInfoPanel: boolean;
}

export const DEFAULT_LAYOUT: LayoutConfig = { collapseInfoPanel: false, hideInfoPanel: false };

export const layoutConfig = writable<LayoutConfig>(DEFAULT_LAYOUT);
