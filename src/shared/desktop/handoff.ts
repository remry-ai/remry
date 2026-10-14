// Links Claude gives the user (`/open/app/...` on the app's address) open in the desktop
// app's window when it's installed: the server hands them over as `remry://open/app/...`,
// which the desktop shell registers (desktop/src-tauri/src/main.rs). Pure: the route and
// handoff.server.ts supply the request, the environment and the process.

/** The scheme the desktop app registers. */
export const DEEP_LINK_SCHEME = 'remry';

/** Where the desktop app's `remry install` records that it's installed, in the data folder. */
export const DESKTOP_MARKER_FILE = 'desktop.json';

/**
 * The app page an `/open/<rest>` link points at (`/app/...` with its query), or null for
 * anything outside the app, so a link can never hand over another path.
 */
export const openTarget = (rest: string, search: string): string | null => {
  const path = `/${rest}`;
  if (path !== '/app' && !path.startsWith('/app/')) return null;
  if (path.split('/').some((segment) => segment === '..' || segment === '.')) return null;
  return `${path}${search}`;
};

/** The target with `notebook=<id>`, so the desktop window opens the notebook the link was for. */
export const withNotebook = (target: string, notebookId: string): string => {
  const url = new URL(target, 'http://app.invalid');
  url.searchParams.set('notebook', notebookId);
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
