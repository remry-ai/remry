import { describe, it, expect } from 'vitest';
import { DEFAULT_LINK_COLOR, chartBaseColor, contrastOnWhite, linkColor } from '../branding';

describe('contrastOnWhite', () => {
  it('matches the WCAG ratio', () => {
    expect(contrastOnWhite('#000000')).toBeCloseTo(21, 0);
    expect(contrastOnWhite('#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('chartBaseColor', () => {
  it('uses the accent when it reads on white', () => {
    expect(chartBaseColor({ accentColor: '#06b6d4', primaryColor: '#4f46e5' })).toBe('#06b6d4');
  });

  it('falls back to the primary colour for a pale accent', () => {
    expect(chartBaseColor({ accentColor: '#eae4d9', primaryColor: '#535f7a' })).toBe('#535f7a');
  });

  it('uses the app default without a branding', () => {
    expect(chartBaseColor(null)).toBe('#52525b');
  });
});

describe('linkColor', () => {
  it('uses the primary colour when it reads on white', () => {
    expect(linkColor({ primaryColor: '#1d4ed8', accentColor: '#f59e0b' })).toBe('#1d4ed8');
  });

  it('falls back to the accent, then the default, when the colours are too pale', () => {
    expect(linkColor({ primaryColor: '#fde68a', accentColor: '#7c3aed' })).toBe('#7c3aed');
    expect(linkColor({ primaryColor: '#fde68a', accentColor: '#e0f2fe' })).toBe(DEFAULT_LINK_COLOR);
    expect(linkColor(null)).toBe(DEFAULT_LINK_COLOR);
  });
});
