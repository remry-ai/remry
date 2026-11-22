// Links Claude gives the user (an app page with `open=app` in its query, on the app's address)
// open in the desktop app's window when it's installed: the server hands them over as
// `remry://open/app/...`, which the desktop shell registers (desktop/src-tauri/src/main.rs).
// `reroute` in src/hooks.ts sends such a request to the `open/[...path]` route, which serves
// nothing else. Pure: the route and handoff.server.ts supply the request, the environment and
// the process.

/** The scheme the desktop app registers. */
export const DEEP_LINK_SCHEME = 'remry';

/** The query parameter, and its value, that ask for a page to open in the desktop app. */
export const OPEN_PARAM = 'open';
export const OPEN_IN_APP = 'app';

const isAppPath = (path: string): boolean => path === '/app' || path.startsWith('/app/');

/**
 * The route a request for an app page with `open=app` goes to (`/open/app/...`), for SvelteKit's
 * `reroute`; undefined for any other request, which keeps its own route.
 */
export const openInAppRoute = (pathname: string, searchParams: URLSearchParams): string | undefined =>
  isAppPath(pathname) && searchParams.get(OPEN_PARAM) === OPEN_IN_APP ? `/open${pathname}` : undefined;

/** Where the desktop app's `remry install` records that it's installed, in the data folder. */
export const DESKTOP_MARKER_FILE = 'desktop.json';

/**
 * The app page a link to open in the app points at (`/app/...` with its query, less `open=app`),
 * or null for anything outside the app, so a link can never hand over another path. `rest` is
 * the page's path without its leading `/`.
 */
export const openTarget = (rest: string, search: string): string | null => {
  const path = `/${rest}`;
  if (!isAppPath(path)) return null;
  if (path.split('/').some((segment) => segment === '..' || segment === '.')) return null;
  const query = new URLSearchParams(search);
  query.delete(OPEN_PARAM);
  const remaining = query.toString();
  return remaining ? `${path}?${remaining}` : path;
};

/** The target with `notebook=<id>`, so the desktop window opens the notebook the link was for. */
export const withNotebook = (target: string, notebookId: string): string => {
  const url = new URL(target, 'http://app.invalid');
  url.searchParams.set('notebook', notebookId);
  return `${url.pathname}${url.search}`;
};

/**
 * The link to give the user for an app page: the page, opening `notebookId` (when given), with
 * `open=app` last, so it opens in the desktop app. Prefix the app's address.
 */
export const inAppLink = (target: string, notebookId: string | null): string => {
  const url = new URL(target, 'http://app.invalid');
  url.searchParams.delete(OPEN_PARAM);
  if (notebookId) url.searchParams.set('notebook', notebookId);
  url.searchParams.set(OPEN_PARAM, OPEN_IN_APP);
  return `${url.pathname}${url.search}`;
};

/** `remry://open/app/...`: the shell reads the path after `open`. */
export const deepLink = (target: string): string => `${DEEP_LINK_SCHEME}://open${target}`;

export interface HandoffHost {
  readonly platform: NodeJS.Platform;
  /** A release binary (REMRY_STANDALONE): a clone's dev server never hands links over. */
  readonly standalone: boolean;
  /** The desktop app has recorded DESKTOP_MARKER_FILE. */
  readonly desktopInstalled: boolean;
}

/** The command that opens a deep link in the desktop app, or null when there's none to hand it to. */
export const handoffCommand = (link: string, host: HandoffHost): readonly string[] | null => {
  if (!host.standalone || !host.desktopInstalled) return null;
  if (host.platform === 'darwin') return ['open', link];
  if (host.platform === 'win32') return ['rundll32', 'url.dll,FileProtocolHandler', link];
  return null;
};
