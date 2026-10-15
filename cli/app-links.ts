// Full links beside the app paths in a tool's result, so Claude gives the user a link that
// works rather than building one from app_open's address (and leaving out /open or the
// notebook). `/open` hands the page to the desktop app's window when it's installed
// (src/shared/desktop/handoff.ts). Pure; mcp.ts supplies the port and the notebook.

import { APP_HOST } from './app-ports';
import { withNotebook } from '../src/shared/desktop/handoff';

/** The link to give the user for an app path: `/open` on the app's address, opening the notebook. */
export const appPageLink = (path: string, notebookId: string, port: number): string =>
  `http://${APP_HOST}:${port}/open${withNotebook(path, notebookId)}`;

const isAppPath = (value: unknown): value is string =>
  typeof value === 'string' && (value === '/app' || value.startsWith('/app/') || value.startsWith('/app?'));

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== 'object') return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Adds `url` (from `link`) after every `path` that's an app path, at any depth. An object
 * that already has a `url` keeps it. Anything that isn't a plain object or array (a Date)
 * passes through as it is.
 */
export const withAppLinks = (value: unknown, link: (path: string) => string): unknown => {
  if (Array.isArray(value)) return value.map((item) => withAppLinks(item, link));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = withAppLinks(child, link);
    if (key === 'path' && isAppPath(child) && !('url' in value)) out['url'] = link(child);
  }
  return out;
};
