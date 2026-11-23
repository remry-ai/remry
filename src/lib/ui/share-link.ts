// The link "Copy link" copies: the page with its notebook and `open=app`, the form Claude's
// links take, so it opens in the desktop app's window when it's installed and in the browser
// otherwise (src/shared/desktop/handoff.ts). The desktop window has no address bar to copy from.
// Pure; CopyLinkButton reads the page's URL and the notebook.

import { LINK_HOST, inAppLink } from '$shared/desktop/handoff';

const isAppPath = (path: string): boolean => path === '/app' || path.startsWith('/app/');

/** The origin to share: on this computer, `localhost` (LINK_HOST) in place of 127.0.0.1; any other host as it is. */
const shareOrigin = (url: URL): string =>
  url.hostname === '127.0.0.1' ? `${url.protocol}//${LINK_HOST}${url.port ? `:${url.port}` : ''}` : url.origin;

/** The page at `url` as a link to share, opening `notebookId`. A page outside the app is its own address. */
export const shareLink = (url: URL, notebookId: string | null): string =>
  isAppPath(url.pathname) ? `${shareOrigin(url)}${inAppLink(`${url.pathname}${url.search}`, notebookId)}` : url.href;
