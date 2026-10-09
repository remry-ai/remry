// App-wide chrome data: the current notebook and the others (for the switcher),
// the default branding icon shown in the nav, and the Remry Pro license.
// A notebook's branding colours the app only while the license is active (Pro);
// without one the brandings stay stored but the app uses its own look.

import { getDefaultBranding } from '$api/branding/operations';
import { listNotebooks } from '$api/notebook/operations';
import { getReadyRegistry } from '$shared/db/bootstrap.server';
import { currentLicense } from '$shared/license/store.server';
import { isProActive } from '$shared/types/license';
import { getNotebookStore } from '$shared/notebooks/current.server';
import { requireRoute } from '$lib/modules/guard';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  // Pages a module owns (/app/goals, /app/orgmap) aren't there in a notebook without it.
  requireRoute(locals.notebook, url.pathname);
  const [defaultBranding, notebooks, license] = await Promise.all([
    getReadyRegistry(locals.notebook.id).then((reg) => getDefaultBranding(reg)),
    listNotebooks({ notebooks: getNotebookStore() }, locals.notebook.id),
    currentLicense()
  ]);
  const branding = isProActive(license) ? defaultBranding : null;
  return {
    license,
    defaultBrandingIconUrl: branding?.ok ? branding.value?.iconUrl ?? null : null,
    // The notebook's default branding colours the app (see `.branded` in styles/_tokens.scss).
    brandTheme: branding?.ok && branding.value
      ? {
          primary: branding.value.primaryColor,
          primaryText: branding.value.primaryFontColor,
          accent: branding.value.accentColor,
          accentText: branding.value.accentFontColor
        }
      : null,
    // Chart colours for doc previews, matching the default branding of an exported PDF.
    chartBranding: branding?.ok && branding.value
      ? {
          primaryColor: branding.value.primaryColor,
          primaryFontColor: branding.value.primaryFontColor,
          accentColor: branding.value.accentColor,
          accentFontColor: branding.value.accentFontColor
        }
      : null,
    notebook: locals.notebook,
    notebooks: notebooks.ok ? notebooks.value : []
  };
};
