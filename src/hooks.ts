// Universal hooks: they run on the server and in the browser, so both pick the same route.

import type { Reroute } from '@sveltejs/kit';
import { openInAppRoute } from '$shared/desktop/handoff';

// A link to an app page with `open=app` (the links Claude and "Copy link" give) goes to the
// open/[...path] route, which hands the page to the desktop app or shows it here.
export const reroute: Reroute = ({ url }) => openInAppRoute(url.pathname, url.searchParams);
