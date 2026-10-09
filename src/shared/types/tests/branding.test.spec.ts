import { describe, it, expect } from 'vitest';
import { chartBaseColor, contrastOnWhite } from '../branding';

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
