// The link "Copy link" copies: the page as an /open link with its notebook, the form Claude's
// links take, so it opens in the desktop app's window when it's installed and in the browser
// otherwise (src/shared/desktop/handoff.ts). The desktop window has no address bar to copy from.
// Pure; CopyLinkButton reads the page's URL and the notebook.

import { withNotebook } from '$shared/desktop/handoff';

const isAppPath = (path: string): boolean => path === '/app' || path.startsWith('/app/');

/** The page at `url` as a link to share, opening `notebookId`. A page outside the app is its own address. */
export const shareLink = (url: URL, notebookId: string | null): string => {
  if (!isAppPath(url.pathname)) return url.href;
  const target = `${url.pathname}${url.search}`;
  return `${url.origin}/open${notebookId ? withNotebook(target, notebookId) : target}`;
};
