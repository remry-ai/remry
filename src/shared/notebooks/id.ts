// Notebook ids name folders on disk and appear in URLs and `--notebook`, so they
// are validated before any path is built from them. Client-safe, and no imports:
// prisma.config.ts loads this through settings/server/paths.ts.

export const NOTEBOOK_ID_RULE = '1–40 lowercase letters, digits and dashes, starting and ending with a letter or digit';

const NOTEBOOK_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export const isNotebookId = (value: unknown): value is string => typeof value === 'string' && NOTEBOOK_ID.test(value);

/** "Side Project!" → "side-project". Empty when the name has no letters or digits. */
export const notebookIdFromName = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 40)
    .replace(/-+$/, '');

/** The id a notebook gets when its name has no letters or digits to make one from. */
const FALLBACK_ID = 'notebook';

/**
 * The id a new notebook gets when none is given: made from its name (`notebook` when the name
 * has no letters or digits), with `-2`, `-3`… when that's taken. Always a valid id, so the app
 * never has to ask for one.
 */
export const uniqueNotebookId = (name: string, taken: ReadonlySet<string>): string => {
  const base = notebookIdFromName(name) || FALLBACK_ID;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const id = `${base.slice(0, 40 - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!taken.has(id)) return id;
  }
};

/** The cookie holding the notebook the UI is looking at. */
export const NOTEBOOK_COOKIE = 'wn-notebook';

/** `?notebook=<id>` on any page switches the UI to that notebook. */
export const NOTEBOOK_PARAM = 'notebook';
