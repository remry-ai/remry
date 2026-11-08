// The notebook's default branding colours, from the /app layout's `chartBranding` (null without
// a branding or without Remry Pro), for what draws in them outside a component's props: mermaid
// diagrams and drawings.

import { page } from '$app/state';
import type { ChartBranding } from '$shared/types/branding';

export const defaultBranding = (): ChartBranding | null =>
  (page.data as { chartBranding?: ChartBranding | null }).chartBranding ?? null;
