// Full links beside the app paths in a tool's result, so Claude gives the user a link that
// works rather than building one from app_open's address (and leaving out `open=app` or the
// notebook). With the desktop app installed the link is `remry://open/app/...`, which opens its
// window without a browser in between (Safari warns before a plain `http://` page); otherwise
// it's the page on the app's address with `open=app` (src/shared/desktop/handoff.ts). Pure;
// mcp.ts supplies the port, the notebook and whether the desktop app takes links.

import { APP_HOST } from './app-ports';
import { desktopPageLink, inAppLink } from '../src/shared/desktop/handoff';

/**
 * The link to give the user for an app path, opening the notebook: a `remry://` link when the
 * desktop app takes links (`desktop`), else the page on the app's address with `open=app`.
 */
export const appPageLink = (path: string, notebookId: string | null, port: number, desktop = false): string =>
  desktop ? desktopPageLink(path, notebookId) : `http://${APP_HOST}:${port}${inAppLink(path, notebookId)}`;

const isAppPath = (value: unknown): value is string =>
  typeof value === 'string' && (value === '/app' || value.startsWith('/app/') || value.startsWith('/app?'));

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== 'object') return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Adds `url` (from `link`) right after the `path` of the item a tool returns: the result itself
 * when it's one object, or a Result's `value`. That's what Claude links to after a get, create
 * or update. Rows of a list and items nested in the result keep just their `path`: a link on
 * every row of a long list cost Claude about a fifth of the list in tokens, and the
 * instructions say how to build one. An item that already has a `url` keeps it.
 */
export const withAppLinks = (value: unknown, link: (path: string) => string): unknown => {
  if (!isPlainObject(value)) return value;
  if (value['ok'] === true && 'value' in value) return { ...value, value: withAppLinks(value['value'], link) };
  const path = value['path'];
  if (!isAppPath(path) || 'url' in value) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = child;
    if (key === 'path') out['url'] = link(path);
  }
  return out;
};
