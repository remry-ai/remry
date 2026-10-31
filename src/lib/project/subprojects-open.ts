// Which project pages have their Sub-projects line opened into the list, remembered per
// notebook in this browser, so a project you come back to shows them the way you left it.
// Pure parts, plus the storage read and write.

const keyFor = (notebookId: string): string => `remry:subprojects-open:${notebookId}`;

/** The most projects remembered; past it the ones opened longest ago are forgotten. */
export const MAX_REMEMBERED = 200;

/** The stored ids, oldest first; anything unreadable means none. */
export const parseOpenIds = (raw: string | null): readonly string[] => {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

/** The ids after one project's list opens (to the end, the newest) or closes. */
export const setOpen = (ids: readonly string[], id: string, open: boolean, max: number = MAX_REMEMBERED): readonly string[] => {
  const rest = ids.filter((other) => other !== id);
  return open ? [...rest, id].slice(-max) : rest;
};

export const loadOpenIds = (notebookId: string): readonly string[] => {
  try {
    return typeof localStorage === 'undefined' ? [] : parseOpenIds(localStorage.getItem(keyFor(notebookId)));
  } catch {
    return [];
  }
};

export const saveOpenIds = (notebookId: string, ids: readonly string[]): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    if (ids.length === 0) localStorage.removeItem(keyFor(notebookId));
    else localStorage.setItem(keyFor(notebookId), JSON.stringify(ids));
  } catch { /* storage unavailable: it lasts this visit only */ }
};
