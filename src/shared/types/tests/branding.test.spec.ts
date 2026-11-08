import { describe, it, expect } from 'vitest';
import { DEFAULT_LINK_COLOR, chartBaseColor, contrastOnWhite, diagramColors, linkColor, mermaidTheme, tint } from '../branding';

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

describe('diagram colours', () => {
  it('tints a colour toward white', () => {
    expect(tint('#000000', 0)).toBe('#000000');
    expect(tint('#000000', 1)).toBe('#ffffff');
    expect(tint('#336699', 0.5)).toBe('#99b3cc');
  });

  it('draws in the colour charts use, filled with a pale tint, or nothing without a branding', () => {
    expect(diagramColors(null)).toBeNull();
    expect(diagramColors({})).toBeNull();
    const colors = diagramColors({ primaryColor: '#1d4ed8', accentColor: '#f97316' });
    expect(colors).toEqual({ stroke: '#f97316', fill: tint('#f97316', 0.85), text: '#1e1e1e' });
  });

  it('gives mermaid its base theme in those colours, or its default theme', () => {
    expect(mermaidTheme(null, 'Inter')).toEqual({ theme: 'default', themeVariables: { fontFamily: 'Inter' } });
    const themed = mermaidTheme({ primaryColor: '#1d4ed8' }, 'Inter');
    expect(themed.theme).toBe('base');
    expect(themed.themeVariables).toMatchObject({ fontFamily: 'Inter', primaryBorderColor: '#1d4ed8', lineColor: '#1d4ed8', primaryColor: tint('#1d4ed8', 0.85) });
  });
});
