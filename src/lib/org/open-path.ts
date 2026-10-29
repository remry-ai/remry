// Which leads are open on the org chart, remembered per notebook in this browser, so the
// chart you come back to opens where you left it. At most one lead is open per row, so
// it's one path from a root down. Pure parts, plus the storage read and write.
import type { OrgTreeNode } from './org-tree';

const keyFor = (notebookId: string): string => `remry:org-open:${notebookId}`;

/** The stored path; null when there's none or it's unreadable. */
export const parseOpenPath = (raw: string | null): readonly string[] | null => {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
};

/** Where the chart starts with nothing remembered: the first lead in the top row open. */
export const defaultOpenPath = (roots: readonly OrgTreeNode[]): readonly string[] => {
  const first = roots.find((n) => n.children.length > 0);
  return first ? [first.person.id] : [];
};

/**
 * The part of `path` that still opens leads in this chart: each id a lead (someone with
 * reports) among the row the one before it opened. It stops at the first id that isn't,
 * since the org may have changed since it was saved.
 */
export const validOpenPath = (roots: readonly OrgTreeNode[], path: readonly string[]): readonly string[] => {
  const valid: string[] = [];
  let row = roots;
  for (const id of path) {
    const node = row.find((n) => n.person.id === id && n.children.length > 0);
    if (!node) break;
    valid.push(id);
    row = node.children;
  }
  return valid;
};

/** The path after the lead at `depth` opens (`id`) or closes (null): rows below it close. */
export const setOpenAt = (path: readonly string[], depth: number, id: string | null): readonly string[] =>
  id === null ? path.slice(0, depth) : [...path.slice(0, depth), id];

/**
 * The path to start from: the remembered one, kept to what's still in the chart, or the
 * default when nothing is remembered or none of it is left. An empty remembered path
 * (everything closed) stays empty.
 */
export const startingOpenPath = (roots: readonly OrgTreeNode[], stored: readonly string[] | null): readonly string[] => {
  if (stored === null) return defaultOpenPath(roots);
  if (stored.length === 0) return [];
  const valid = validOpenPath(roots, stored);
  return valid.length > 0 ? valid : defaultOpenPath(roots);
};

export const loadOpenPath = (notebookId: string): readonly string[] | null => {
  try {
    return typeof localStorage === 'undefined' ? null : parseOpenPath(localStorage.getItem(keyFor(notebookId)));
  } catch {
    return null;
  }
};

/** Null forgets it, so the chart opens on the default again. */
export const saveOpenPath = (notebookId: string, path: readonly string[] | null): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    if (path === null) localStorage.removeItem(keyFor(notebookId));
    else localStorage.setItem(keyFor(notebookId), JSON.stringify(path));
  } catch { /* storage unavailable: it lasts this visit only */ }
};
