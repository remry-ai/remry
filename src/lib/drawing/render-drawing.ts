// A drawing as a PNG, for embeds on screen and in PDFs. It uses Excalidraw's
// canvas export, which draws with the fonts the page has loaded, so the CSP
// needs nothing more (the SVG export subsets fonts with WebAssembly).

import type { DrawingContent } from '$shared/utils/drawing';
import { isEmptyDrawing } from '$shared/utils/drawing';
import { loadExcalidraw, toScene } from './excalidraw';

export interface RenderedDrawing {
  readonly blob: Blob;
  /** CSS pixels at scale 1. */
  readonly width: number;
  readonly height: number;
}

export interface RenderOptions {
  /** Pixels per CSS pixel: 2 on screen, more for print. */
  readonly scale?: number;
  readonly dark?: boolean;
  /** Draw the background colour (white, or the drawing's own); false leaves it transparent. */
  readonly background?: boolean;
}

/** Renders a drawing to PNG, or null when there's nothing in it. */
export const renderDrawing = async (content: DrawingContent, options: RenderOptions = {}): Promise<RenderedDrawing | null> => {
  if (isEmptyDrawing(content)) return null;
  const lib = await loadExcalidraw();
  const scene = await toScene(lib, content);
  if (scene.elements.length === 0) return null;
  const scale = options.scale ?? 2;
  let size = { width: 0, height: 0 };
  const blob = await lib.exportToBlob({
    elements: scene.elements,
    files: null,
    mimeType: 'image/png',
    exportPadding: 16,
    appState: {
      exportBackground: options.background ?? true,
      viewBackgroundColor: scene.viewBackgroundColor ?? '#ffffff',
      exportWithDarkMode: options.dark ?? false
    },
    getDimensions: (width: number, height: number) => {
      size = { width, height };
      return { width: width * scale, height: height * scale, scale };
    }
  });
  return { blob, width: size.width, height: size.height };
};
