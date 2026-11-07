// Loads Excalidraw (and React) on demand, and turns a stored drawing into the
// scene Excalidraw draws. Only drawing pages and embeds import it, so pages
// without a drawing never load it.

import type { DrawingContent } from '$shared/utils/drawing';
import { isSkeleton, layoutSkeleton } from '$shared/utils/drawing';
import type { ExcalidrawElement, NonDeleted } from '@excalidraw/excalidraw/element/types';
import type * as Excalidraw from '@excalidraw/excalidraw';
import { keepFontsLocal } from './font-sources';

export type ExcalidrawModule = typeof Excalidraw;

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

let loading: Promise<ExcalidrawModule> | null = null;

/**
 * Excalidraw, with its fonts served by the app (`/excalidraw/fonts/`, see
 * scripts/vite/excalidraw-fonts.ts) and never from its CDN, which the CSP
 * blocks (font-sources.ts).
 */
export const loadExcalidraw = (): Promise<ExcalidrawModule> => {
  if (!loading) {
    window.EXCALIDRAW_ASSET_PATH = `${window.location.origin}/excalidraw/`;
    keepFontsLocal();
    loading = import('@excalidraw/excalidraw').catch((e: unknown) => {
      loading = null;
      throw e;
    });
  }
  return loading;
};

export interface DrawingScene {
  readonly elements: readonly NonDeleted<ExcalidrawElement>[];
  readonly viewBackgroundColor?: string;
  readonly gridSize?: number | null;
}

let fontsLoaded: Promise<void> | null = null;

/**
 * Loads Excalidraw's hand-drawn font, which a skeleton's text is measured in
 * when it's expanded: measured in a fallback, a label wraps where it shouldn't.
 * Exporting a one-word drawing is what makes Excalidraw load it.
 */
const loadDrawingFont = (lib: ExcalidrawModule): Promise<void> => {
  fontsLoaded ??= (async () => {
    const probe = lib.convertToExcalidrawElements([{ type: 'text', x: 0, y: 0, text: 'Aa' }]);
    await lib.exportToCanvas({ elements: probe, files: null });
  })().catch(() => undefined);
  return fontsLoaded;
};

/**
 * A stored drawing as Excalidraw elements: a scene's own elements (restored, so
 * one written by hand or by an older Excalidraw is filled in), or a skeleton
 * laid out (layoutSkeleton) and expanded with convertToExcalidrawElements, once
 * its font has loaded.
 */
export const toScene = async (lib: ExcalidrawModule, content: DrawingContent): Promise<DrawingScene> => {
  if (isSkeleton(content)) {
    await loadDrawingFont(lib);
    const placed = layoutSkeleton(content.skeleton, content.layout);
    // The skeleton's own shape is checked on the server; Excalidraw's type is wider.
    const elements = lib.convertToExcalidrawElements(placed as unknown as Parameters<ExcalidrawModule['convertToExcalidrawElements']>[0], { regenerateIds: false });
    return { elements: lib.getNonDeletedElements(elements) as readonly NonDeleted<ExcalidrawElement>[] };
  }
  const restored = lib.restoreElements(content.elements as unknown as Parameters<ExcalidrawModule['restoreElements']>[0], null);
  return {
    elements: lib.getNonDeletedElements(restored) as readonly NonDeleted<ExcalidrawElement>[],
    viewBackgroundColor: content.appState?.viewBackgroundColor,
    gridSize: content.appState?.gridSize
  };
};
