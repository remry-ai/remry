// The projects table's open and closed rows, remembered per notebook in this browser, so the
// list you come back to keeps the rows you opened. One entry per view (team filter and
// grouping), since each starts from its own default. Pure parts, plus the storage read and write.

import type { CollapseBase } from './project-list';

export interface ViewCollapse {
  readonly base: CollapseBase;
  /** Rows flipped away from `base`. */
  readonly toggled: readonly string[];
}

export type StoredCollapse = Readonly<Record<string, ViewCollapse>>;

const keyFor = (notebookId: string): string => `remry:projects-collapsed:${notebookId}`;

const isBase = (value: unknown): value is CollapseBase => value === 'collapsed' || value === 'expanded';

/** The stored views; anything unreadable is left out. */
export const parseStoredCollapse = (raw: string | null): StoredCollapse => {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    const views: Record<string, ViewCollapse> = {};
    for (const [view, entry] of Object.entries(value as Record<string, unknown>)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { base, toggled } = entry as { base?: unknown; toggled?: unknown };
      if (!isBase(base) || !Array.isArray(toggled)) continue;
      views[view] = { base, toggled: toggled.filter((id): id is string => typeof id === 'string') };
    }
    return views;
  } catch {
    return {};
  }
};

/**
 * The stored views after one view changes. A view back at its default (its own base, nothing
 * toggled) is dropped, and toggled ids are kept only for projects that still exist.
 */
export const withView = (
  stored: StoredCollapse,
  view: string,
  state: ViewCollapse,
  defaultBase: CollapseBase,
  existing: ReadonlySet<string>
): StoredCollapse => {
  const toggled = state.toggled.filter((id) => existing.has(id));
  const { [view]: _old, ...rest } = stored;
  return state.base === defaultBase && toggled.length === 0 ? rest : { ...rest, [view]: { base: state.base, toggled } };
};

export const loadStoredCollapse = (notebookId: string): StoredCollapse => {
  try {
    return typeof localStorage === 'undefined' ? {} : parseStoredCollapse(localStorage.getItem(keyFor(notebookId)));
  } catch {
    return {};
  }
};

export const saveStoredCollapse = (notebookId: string, stored: StoredCollapse): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    if (Object.keys(stored).length === 0) localStorage.removeItem(keyFor(notebookId));
    else localStorage.setItem(keyFor(notebookId), JSON.stringify(stored));
  } catch { /* storage unavailable: it lasts this visit only */ }
};
