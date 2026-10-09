export interface ChartBranding {
  readonly primaryColor?: string;
  readonly primaryFontColor?: string;
  readonly accentColor?: string;
  readonly accentFontColor?: string;
}

const DEFAULT_COLOR = '#52525b';

const hexToRgb = (hex: string): string => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)].join(', ');
};

/** `rgba(r, g, b, 1)` for a #rrggbb colour. */
export const solidRgba = (hex: string): string => `rgba(${hexToRgb(hex)}, 1)`;

/** WCAG contrast of a #rrggbb colour against white. */
export const contrastOnWhite = (hex: string): number => {
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex).split(', ').map(Number) as [number, number, number];
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return 1.05 / (luminance + 0.05);
};

/** Below this a colour washes out on white (a cream or pale grey accent); cyan (#06b6d4) is about 2.4. */
const MIN_CHART_CONTRAST = 1.6;

/**
 * The colour charts draw with: the brand's accent, or its primary colour when the accent
 * is too pale to read on white, or the app's default without a branding.
 */
export const chartBaseColor = (branding?: ChartBranding | null): string =>
  [branding?.accentColor, branding?.primaryColor].find(
    (c): c is string => !!c && contrastOnWhite(c) >= MIN_CHART_CONTRAST
  ) ?? branding?.primaryColor ?? DEFAULT_COLOR;

export const chartColors = (branding?: ChartBranding | null): {
  readonly fill: string;
  readonly border: string;
  readonly solid: string;
} => {
  const base = chartBaseColor(branding);
  const rgb = hexToRgb(base);
  return {
    fill: `rgba(${rgb}, 0.7)`,
    border: branding?.accentColor === base && branding.accentFontColor ? branding.accentFontColor : `rgba(${rgb}, 1)`,
    solid: solidRgba(base),
  };
};
