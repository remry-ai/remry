// The wiki tree's collapsed rows, remembered per notebook in this browser, so a page
// you come back to keeps the branches you closed. Pure parts, plus the storage read and write.

const keyFor = (notebookId: string): string => `remry:wiki-collapsed:${notebookId}`;

/** The stored list of collapsed ids; anything unreadable means none. */
export const parseCollapsed = (raw: string | null): ReadonlySet<string> => {
  if (!raw) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
};

/** Null when nothing is collapsed, so the key is removed. */
export const serialiseCollapsed = (collapsed: ReadonlySet<string>): string | null =>
  collapsed.size === 0 ? null : JSON.stringify([...collapsed]);

/** The pages that have sub-pages among these: what "Collapse all" closes. */
export const parentIds = (pages: readonly { readonly id: string; readonly parentId: string | null }[]): ReadonlySet<string> => {
  const ids = new Set(pages.map((p) => p.id));
  return new Set(pages.flatMap((p) => (p.parentId !== null && ids.has(p.parentId) ? [p.parentId] : [])));
};

export const toggleId = (collapsed: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  const next = new Set(collapsed);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

export const loadCollapsed = (notebookId: string): ReadonlySet<string> => {
  try {
    return typeof localStorage === 'undefined' ? new Set() : parseCollapsed(localStorage.getItem(keyFor(notebookId)));
  } catch {
    return new Set();
  }
};

export const saveCollapsed = (notebookId: string, collapsed: ReadonlySet<string>): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = serialiseCollapsed(collapsed);
    if (raw === null) localStorage.removeItem(keyFor(notebookId));
    else localStorage.setItem(keyFor(notebookId), raw);
  } catch { /* storage unavailable: it lasts this visit only */ }
};
