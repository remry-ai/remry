// The links Claude gives the user: an app page with `open=app` in its query, which `reroute` in
// src/hooks.ts sends here, keeping the page's own address. With the desktop app installed, the
// page opens in its window and this tab says so; otherwise the link just shows the page here,
// without `open`. Only rerouted requests are served: `/open/...` itself is a 404.
// See $shared/desktop/handoff.ts.

import { error, redirect } from '@sveltejs/kit';
import { openInAppRoute, openTarget, withNotebook } from '$shared/desktop/handoff';
import { handOff } from '$shared/desktop/handoff.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
  if (!openInAppRoute(url.pathname, url.searchParams)) error(404, 'Not found');
  const target = openTarget(url.pathname.slice(1), url.search);
  if (!target) error(404, 'Not a Remry page');
  // The notebook handle has already moved ?notebook= into this browser's cookie.
  if (!(await handOff(withNotebook(target, locals.notebook.id)))) redirect(303, target);
  return { target };
};
