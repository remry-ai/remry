// Drawer widths, set by dragging a drawer's inner edge. Pure; the stores
// (`panelWidth` and `sidebarWidth` in stores/drawers.ts) keep them in localStorage.

export const PANEL_MIN_W = 280;
export const SIDEBAR_MIN_W = 200;
/** Leave at least this much for the page beside the docked drawers. */
export const PANEL_MIN_MAIN_W = 480;
/** A floating drawer leaves this much of the page showing beside it. */
export const FLOAT_GUTTER = 48;
/** One arrow-key step on a resize handle. */
export const PANEL_KEY_STEP = 24;

export interface DrawerFit {
  readonly min: number;
  readonly viewport: number;
  /** Over the page instead of beside it: only the window bounds it. */
  readonly floating: boolean;
  /** The width of the other drawer, when it's docked and open. */
  readonly otherDocked?: number;
}

/** Clamp a drawer's width to what fits at this viewport width. */
export const clampDrawerWidth = (width: number, fit: DrawerFit): number => {
  const room = fit.floating ? fit.viewport - FLOAT_GUTTER : fit.viewport - PANEL_MIN_MAIN_W - (fit.otherDocked ?? 0);
  const max = Math.max(fit.min, room);
  return Math.round(Math.min(Math.max(width, fit.min), max));
};

/** Clamp the right panel's width to what fits beside the page at this viewport width. */
export const clampPanelWidth = (width: number, viewport: number): number =>
  clampDrawerWidth(width, { min: PANEL_MIN_W, viewport, floating: false });

// The `--sidebar-w` and `--panel-w` token defaults, in px.
const tokenWidth = (min: number, share: number, max: number, viewport: number): number =>
  Math.min(Math.max(viewport * share, min), max);

export interface DrawerLayout {
  readonly viewport: number;
  readonly sidebar: { readonly stored: number | null; readonly floating: boolean; readonly dockedOpen: boolean };
  readonly panel: { readonly stored: number | null; readonly floating: boolean; readonly dockedOpen: boolean };
}

export interface DrawerCssWidths {
  /** Undefined while nothing was dragged: the CSS default for the drawer's mode. */
  readonly sidebar: string | undefined;
  readonly panel: string | undefined;
}

/**
 * The widths to set as `--sidebar-drag-w` and `--panel-drag-w`: a dragged width
 * clamped to what fits, leaving room for the page beside both docked drawers.
 */
export const drawerCssWidths = (layout: DrawerLayout): DrawerCssWidths => {
  const { viewport, sidebar, panel } = layout;
  if (viewport <= 0) return { sidebar: undefined, panel: undefined };
  const sidebarGuess = sidebar.stored ?? tokenWidth(SIDEBAR_MIN_W, 0.18, 320, viewport);
  const panelPx = panel.stored === null ? null : clampDrawerWidth(panel.stored, {
    min: PANEL_MIN_W, viewport, floating: panel.floating, otherDocked: sidebar.dockedOpen ? sidebarGuess : 0,
  });
  const panelActual = panelPx ?? tokenWidth(PANEL_MIN_W, 0.26, 460, viewport);
  const sidebarPx = sidebar.stored === null ? null : clampDrawerWidth(sidebar.stored, {
    min: SIDEBAR_MIN_W, viewport, floating: sidebar.floating, otherDocked: panel.dockedOpen ? panelActual : 0,
  });
  const css = (px: number | null): string | undefined => (px === null ? undefined : `${px}px`);
  return { sidebar: css(sidebarPx), panel: css(panelPx) };
};

/** A stored width, or null when there's none or it isn't a number. */
export const parseStoredWidth = (raw: string | null): number | null => {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};
