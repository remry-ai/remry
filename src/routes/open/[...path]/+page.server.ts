// `/open/app/...`: the links Claude gives the user. With the desktop app installed, the page
// opens in its window and this tab says so; otherwise the link just shows the page here.
// See $shared/desktop/handoff.ts.

import { error, redirect } from '@sveltejs/kit';
import { openTarget, withNotebook } from '$shared/desktop/handoff';
import { handOff } from '$shared/desktop/handoff.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const target = openTarget(params.path, url.search);
  if (!target) error(404, 'Not a Remry page');
  // The notebook handle has already moved ?notebook= into this browser's cookie.
  if (!(await handOff(withNotebook(target, locals.notebook.id)))) redirect(303, target);
  return { target };
};
