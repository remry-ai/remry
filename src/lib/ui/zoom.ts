// Zoom and pan for ZoomViewer: where the content sits and how big it is, as a
// scale and an offset of its top-left corner within the viewport. Pure.

export interface ZoomView {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** What ZoomViewer shows: a copy of a diagram's SVG (with its drawn size), or an image. */
export type ZoomSource =
  | { readonly kind: 'svg'; readonly markup: string; readonly size: Size }
  | { readonly kind: 'image'; readonly src: string; readonly alt: string };

export const ZOOM_LIMITS = { min: 0.1, max: 8, step: 1.25 } as const;

const clampScale = (scale: number): number => Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, scale));

/** The content at `scale`, centred in the viewport. */
export const centredView = (content: Size, viewport: Size, scale: number): ZoomView => {
  const s = clampScale(scale);
  return { scale: s, x: (viewport.width - content.width * s) / 2, y: (viewport.height - content.height * s) / 2 };
};

/** The whole content in the viewport, with `padding` around it, centred. Small content grows to fill it. */
export const fitView = (content: Size, viewport: Size, padding = 0): ZoomView => {
  if (content.width <= 0 || content.height <= 0) return { scale: 1, x: 0, y: 0 };
  const width = Math.max(1, viewport.width - padding * 2);
  const height = Math.max(1, viewport.height - padding * 2);
  return centredView(content, viewport, Math.min(width / content.width, height / content.height));
};

/** Zooms by `factor`, keeping the content under `point` (viewport coordinates) where it is. */
export const zoomAt = (view: ZoomView, factor: number, point: Point): ZoomView => {
  const scale = clampScale(view.scale * factor);
  const k = scale / view.scale;
  return { scale, x: point.x - (point.x - view.x) * k, y: point.y - (point.y - view.y) * k };
};

export const panBy = (view: ZoomView, dx: number, dy: number): ZoomView => ({ ...view, x: view.x + dx, y: view.y + dy });

/** The scale as a percentage: 1.5 → "150%". */
export const scaleLabel = (view: ZoomView): string => `${Math.round(view.scale * 100)}%`;
