import { describe, expect, it } from 'vitest';
import { clampPanelWidth, parseStoredWidth, PANEL_MIN_MAIN_W, PANEL_MIN_W } from '../panel-width';

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
