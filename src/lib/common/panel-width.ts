// The right panel's width, set by dragging its left edge. Pure; the store
// (`panelWidth` in stores/right-panel.ts) keeps it in localStorage.

export const PANEL_MIN_W = 280;
/** Leave at least this much for the page beside the panel. */
export const PANEL_MIN_MAIN_W = 480;
/** One arrow-key step on the resize handle. */
export const PANEL_KEY_STEP = 24;

/** Clamp a width to what fits beside the page at this viewport width. */
export const clampPanelWidth = (width: number, viewport: number): number => {
  const max = Math.max(PANEL_MIN_W, viewport - PANEL_MIN_MAIN_W);
  return Math.round(Math.min(Math.max(width, PANEL_MIN_W), max));
};

/** A stored width, or null when there's none or it isn't a number. */
export const parseStoredWidth = (raw: string | null): number | null => {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};
