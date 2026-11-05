// The app's one font (--font-text, from lib/ui/app-font.ts), for what draws its own text: chart.js
// canvases and mermaid diagrams, which don't inherit CSS fonts.

import { APP_FONT } from './app-font';

const FALLBACK = APP_FONT.family;

/** The font stack --font-text resolves to on this page. */
export const textFontFamily = (): string => {
  if (typeof document === 'undefined') return FALLBACK;
  return getComputedStyle(document.documentElement).getPropertyValue('--font-text').trim() || FALLBACK;
};

/** Resolves once the page's fonts have loaded, so a canvas isn't drawn in a fallback it keeps. */
export const fontsReady = async (): Promise<void> => {
  if (typeof document === 'undefined' || !document.fonts) return;
  await document.fonts.ready;
};
