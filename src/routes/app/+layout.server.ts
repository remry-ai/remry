// App-wide chrome data: the current notebook and the others (for the switcher),
// the default branding icon shown in the nav, the Remry Pro license (and how many free drawings
// are used), and the default AI assistant.
// A notebook's branding colours the app only while the license is active (Pro);
// without one the brandings stay stored but the app uses its own look.

import { getDefaultBranding } from '$api/branding/operations';
import { countDrawings } from '$api/_license';
import { listNotebooks } from '$api/notebook/operations';
import { getReadyRegistry } from '$shared/db/bootstrap.server';
import { currentLicense } from '$shared/license/store.server';
import { savedLlm } from '$shared/assist/llm-choice.server';
import { llmProvider } from '$shared/assist/providers/registry';
import { linkColor } from '$shared/types/branding';
import { FREE_DRAWINGS, canAddDrawing, isProActive } from '$shared/types/license';
import { getNotebookStore } from '$shared/notebooks/current.server';
import { requireRoute } from '$lib/modules/guard';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  // Pages a module owns (/app/goals, /app/orgmap) aren't there in a notebook without it.
  requireRoute(locals.notebook, url.pathname);
  const reg = await getReadyRegistry(locals.notebook.id);
  const [defaultBranding, drawings, notebooks, license, llm] = await Promise.all([
    getDefaultBranding(reg),
    countDrawings(reg),
    listNotebooks({ notebooks: getNotebookStore() }, locals.notebook.id),
    currentLicense(),
    savedLlm()
  ]);
  const branding = isProActive(license) ? defaultBranding : null;
  return {
    license,
    // The create menus say how many of the free drawings are used, and lock another past them.
    drawingAllowance: { used: drawings, free: FREE_DRAWINGS, canAdd: canAddDrawing(drawings, license), pro: isProActive(license) },
    // The default AI assistant's name, for labels ("Convert with Copilot"); null before one is picked.
    assistantName: llm ? llmProvider(llm).name : null,
    defaultBrandingIconUrl: branding?.ok ? branding.value?.iconUrl ?? null : null,
    // The notebook's default branding colours the app (see `.branded` in styles/_tokens.scss).
    brandTheme: branding?.ok && branding.value
      ? {
          primary: branding.value.primaryColor,
          primaryText: branding.value.primaryFontColor,
          accent: branding.value.accentColor,
          accentText: branding.value.accentFontColor,
          link: linkColor(branding.value)
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
