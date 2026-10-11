import { describe, expect, it } from 'vitest';
import {
  clampDrawerWidth, clampPanelWidth, drawerCssWidths, parseStoredWidth, FLOAT_GUTTER, PANEL_MIN_MAIN_W, PANEL_MIN_W, SIDEBAR_MIN_W,
} from '../panel-width';

describe('clampPanelWidth', () => {
  it('keeps a width that fits', () => {
    expect(clampPanelWidth(500, 1400)).toBe(500);
  });

  it('never goes below the minimum', () => {
    expect(clampPanelWidth(100, 1400)).toBe(PANEL_MIN_W);
  });

  it('leaves room for the page', () => {
    expect(clampPanelWidth(1200, 1400)).toBe(1400 - PANEL_MIN_MAIN_W);
  });

  it('keeps the minimum on a narrow viewport', () => {
    expect(clampPanelWidth(600, 600)).toBe(PANEL_MIN_W);
  });

  it('rounds to whole pixels', () => {
    expect(clampPanelWidth(400.6, 1400)).toBe(401);
  });
});

describe('parseStoredWidth', () => {
  it('reads a number', () => {
    expect(parseStoredWidth('420')).toBe(420);
  });

  it('ignores nothing, junk and non-positive values', () => {
    expect(parseStoredWidth(null)).toBeNull();
    expect(parseStoredWidth('wide')).toBeNull();
    expect(parseStoredWidth('0')).toBeNull();
  });
});

describe('clampDrawerWidth', () => {
  it('leaves room for the page and the other docked drawer', () => {
    expect(clampDrawerWidth(900, { min: PANEL_MIN_W, viewport: 1400, floating: false, otherDocked: 300 })).toBe(1400 - PANEL_MIN_MAIN_W - 300);
  });

  it('lets a floating drawer cover the page, short of a gutter', () => {
    expect(clampDrawerWidth(900, { min: PANEL_MIN_W, viewport: 800, floating: true, otherDocked: 300 })).toBe(800 - FLOAT_GUTTER);
  });

  it('keeps the minimum', () => {
    expect(clampDrawerWidth(50, { min: SIDEBAR_MIN_W, viewport: 1400, floating: false })).toBe(SIDEBAR_MIN_W);
  });
});

describe('drawerCssWidths', () => {
  const closed = { stored: null, floating: false, dockedOpen: false };

  it('leaves the defaults to CSS while nothing was dragged', () => {
    expect(drawerCssWidths({ viewport: 1400, sidebar: closed, panel: closed })).toEqual({ sidebar: undefined, panel: undefined });
    expect(drawerCssWidths({ viewport: 600, sidebar: { ...closed, floating: true }, panel: { ...closed, floating: true } }))
      .toEqual({ sidebar: undefined, panel: undefined });
  });

  it('keeps a floating drawer inside the window', () => {
    const widths = drawerCssWidths({ viewport: 400, sidebar: closed, panel: { stored: 600, floating: true, dockedOpen: false } });
    expect(widths.panel).toBe(`${400 - FLOAT_GUTTER}px`);
  });

  it('shrinks a dragged panel to fit beside a docked sidebar', () => {
    const widths = drawerCssWidths({
      viewport: 1400,
      sidebar: { stored: 300, floating: false, dockedOpen: true },
      panel: { stored: 900, floating: false, dockedOpen: true },
    });
    expect(widths.panel).toBe(`${1400 - PANEL_MIN_MAIN_W - 300}px`);
  });

  it('ignores a closed sidebar', () => {
    const widths = drawerCssWidths({ viewport: 1400, sidebar: { stored: 300, floating: false, dockedOpen: false }, panel: { stored: 900, floating: false, dockedOpen: true } });
    expect(widths.panel).toBe('900px');
  });
});
