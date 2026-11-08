// A drawing page's body: JSON in page.content when bodyType is 'drawing', drawn
// and edited with Excalidraw in the app. It takes one of two forms:
//
// - a scene, `{ version: 1, elements, appState? }`: Excalidraw's own elements,
//   what the app saves once the drawing has been opened;
// - a skeleton, `{ version: 1, skeleton, layout? }`: a short list of shapes,
//   labels and arrows, what Claude writes from the CLI or MCP. The browser
//   expands it into a scene (layoutSkeleton, then Excalidraw's
//   convertToExcalidrawElements) when the drawing is shown, and the first edit
//   in the app saves it as a scene.
//
// Pure, shared by the server (validation) and the client (the editor, previews
// and the PDF). Images aren't kept in a drawing (the editor's image tool is
// off), so `files` never holds base64.

import { z } from 'zod';
import { ok, err, type Result } from './result';

export const DRAWING_LIMITS = { elements: 5000, skeleton: 500, text: 5000, bytes: 2_000_000, id: 100 } as const;

export const SKELETON_TYPES = ['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line'] as const;

export type SkeletonType = (typeof SKELETON_TYPES)[number];

export const SKELETON_LAYOUTS = ['down', 'right'] as const;

export type SkeletonLayout = (typeof SKELETON_LAYOUTS)[number];

export interface SkeletonLabel {
  readonly text: string;
  readonly fontSize?: number;
  readonly strokeColor?: string;
}

export interface SkeletonElement {
  readonly type: SkeletonType;
  readonly id?: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  /** Text inside a shape, or on an arrow. */
  readonly label?: SkeletonLabel;
  /** A text element's text. */
  readonly text?: string;
  readonly fontSize?: number;
  /** An arrow's or line's ends, bound to the shapes with these ids. */
  readonly start?: { readonly id: string };
  readonly end?: { readonly id: string };
  readonly strokeColor?: string;
  readonly backgroundColor?: string;
  readonly fillStyle?: 'solid' | 'hachure' | 'cross-hatch';
  readonly strokeStyle?: 'solid' | 'dashed' | 'dotted';
  readonly strokeWidth?: number;
}

export interface DrawingAppState {
  readonly viewBackgroundColor?: string;
  readonly gridSize?: number | null;
}

/** Excalidraw's own scene. Elements are kept as Excalidraw wrote them. */
export interface DrawingScene {
  readonly version: 1;
  readonly elements: readonly Readonly<Record<string, unknown>>[];
  readonly appState?: DrawingAppState;
}

/** What Claude writes: shapes, labels and arrows, laid out when drawn. */
export interface DrawingSkeleton {
  readonly version: 1;
  readonly skeleton: readonly SkeletonElement[];
  /** Which way shapes without x/y flow along their arrows: top to bottom (the default) or left to right. */
  readonly layout?: SkeletonLayout;
}

export type DrawingContent = DrawingScene | DrawingSkeleton;

export const isSkeleton = (content: DrawingContent): content is DrawingSkeleton => 'skeleton' in content;

const FILLED_SHAPES: ReadonlySet<SkeletonType> = new Set(['rectangle', 'ellipse', 'diamond']);

/**
 * A skeleton in the branding's colours (`diagramColors` in $shared/types/branding), wherever
 * Claude gave none: shapes outlined in `stroke` and filled solid with `fill`, arrows and lines
 * in `stroke`. A colour the skeleton sets is kept.
 */
export const colorSkeleton = (
  content: DrawingSkeleton,
  colors: { readonly stroke: string; readonly fill: string } | null
): DrawingSkeleton => {
  if (!colors) return content;
  const skeleton = content.skeleton.map((element): SkeletonElement => {
    if (FILLED_SHAPES.has(element.type)) {
      return {
        ...element,
        strokeColor: element.strokeColor ?? colors.stroke,
        ...(element.backgroundColor ? {} : { backgroundColor: colors.fill, fillStyle: element.fillStyle ?? 'solid' })
      };
    }
    if (element.type === 'arrow' || element.type === 'line') return { ...element, strokeColor: element.strokeColor ?? colors.stroke };
    return element;
  });
  return { ...content, skeleton };
};

const text = z.string().max(DRAWING_LIMITS.text);
const color = z.string().max(40);
const id = z.string().min(1).max(DRAWING_LIMITS.id);
const coord = z.number().finite().min(-100_000).max(100_000);
const size = z.number().finite().min(0).max(100_000);
const fontSize = z.number().finite().min(4).max(400);

const skeletonElement = z
  .object({
    type: z.enum(SKELETON_TYPES),
    id: id.optional(),
    x: coord.optional(),
    y: coord.optional(),
    width: size.optional(),
    height: size.optional(),
    label: z.object({ text, fontSize: fontSize.optional(), strokeColor: color.optional() }).strict().optional(),
    text: text.optional(),
    fontSize: fontSize.optional(),
    start: z.object({ id }).strict().optional(),
    end: z.object({ id }).strict().optional(),
    strokeColor: color.optional(),
    backgroundColor: color.optional(),
    fillStyle: z.enum(['solid', 'hachure', 'cross-hatch']).optional(),
    strokeStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
    strokeWidth: z.number().finite().min(0.5).max(20).optional()
  })
  .strict();

const skeletonSchema = z
  .object({
    version: z.literal(1).default(1),
    skeleton: z.array(skeletonElement).max(DRAWING_LIMITS.skeleton),
    layout: z.enum(SKELETON_LAYOUTS).optional()
  })
  .strict()
  .superRefine((drawing, ctx) => {
    const ids = new Set<string>();
    drawing.skeleton.forEach((el, i) => {
      if (el.id === undefined) return;
      if (ids.has(el.id)) ctx.addIssue({ code: 'custom', path: ['skeleton', i, 'id'], message: `"${el.id}" is used twice; ids must be unique` });
      ids.add(el.id);
    });
    drawing.skeleton.forEach((el, i) => {
      const linear = el.type === 'arrow' || el.type === 'line';
      if (el.type === 'text' && !el.text?.trim()) ctx.addIssue({ code: 'custom', path: ['skeleton', i, 'text'], message: 'is required for a text element' });
      if (el.type === 'text' && el.label) ctx.addIssue({ code: 'custom', path: ['skeleton', i, 'label'], message: 'is for shapes and arrows; a text element uses "text"' });
      if (el.type !== 'text' && el.text !== undefined) ctx.addIssue({ code: 'custom', path: ['skeleton', i, 'text'], message: `is for text elements; give a ${el.type} a "label": {"text": …}` });
      for (const end of ['start', 'end'] as const) {
        const ref = el[end];
        if (!ref) continue;
        if (!linear) ctx.addIssue({ code: 'custom', path: ['skeleton', i, end], message: 'is for arrows and lines' });
        else if (!ids.has(ref.id)) ctx.addIssue({ code: 'custom', path: ['skeleton', i, end, 'id'], message: `"${ref.id}" isn't the id of any element` });
      }
    });
  });

// A scene is Excalidraw's: each element needs an id and a type; the rest is kept as written.
// An `.excalidraw` file, or a drawing from a share link, is one too (`"type": "excalidraw",
// "version": 2`, with `source` and `files`).
const sceneSchema = z
  .object({
    version: z.number().int().min(1).max(10).default(1),
    elements: z.array(z.object({ id: z.string().min(1), type: z.string().min(1) }).passthrough()).max(DRAWING_LIMITS.elements),
    appState: z
      .object({ viewBackgroundColor: color.optional(), gridSize: z.number().nullable().optional() })
      .strip()
      .optional(),
    // Older or hand-made scenes may carry these; they're dropped.
    files: z.unknown().optional(),
    type: z.unknown().optional(),
    source: z.unknown().optional()
  })
  .strict();

/** A new, empty drawing. */
export const emptyDrawing = (): DrawingScene => ({ version: 1, elements: [] });

const EXAMPLE = '{"skeleton":[{"type":"rectangle","id":"a","label":{"text":"Start"}},{"type":"rectangle","id":"b","label":{"text":"End"}},{"type":"arrow","start":{"id":"a"},"end":{"id":"b"}}]}';

const issuesText = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join('.') || 'drawing'} ${issue.message}`).join('; ');

/**
 * Validates a drawing (an object or its JSON); an empty string is a new, empty
 * drawing. A skeleton keeps its form; a scene keeps only live elements (deleted
 * ones dropped) and no files. Errors name the element and field.
 */
export const parseDrawingContent = (input: unknown): Result<DrawingContent> => {
  let value = input;
  if (typeof value === 'string') {
    if (value.length > DRAWING_LIMITS.bytes) return err(new Error(`drawing content: ${value.length} characters is over the limit of ${DRAWING_LIMITS.bytes}`));
    if (!value.trim()) return ok(emptyDrawing());
    try {
      value = JSON.parse(value);
    } catch (e) {
      return err(new Error(`drawing content: invalid JSON (${e instanceof Error ? e.message : String(e)}). A drawing is ${EXAMPLE}`));
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return err(new Error(`drawing content: must be an object with "skeleton" (shapes, labels and arrows) or "elements" (an Excalidraw scene), like ${EXAMPLE}`));
  }
  if ('skeleton' in value) {
    const parsed = skeletonSchema.safeParse(value);
    if (!parsed.success) return err(new Error(`drawing content: ${issuesText(parsed.error)}`));
    const { skeleton, layout } = parsed.data;
    return ok({ version: 1, skeleton, ...(layout && { layout }) });
  }
  if ('elements' in value) {
    const parsed = sceneSchema.safeParse(value);
    if (!parsed.success) return err(new Error(`drawing content: ${issuesText(parsed.error)}`));
    // Pictures live in `files`, which a drawing doesn't keep, so image elements go too.
    const elements = parsed.data.elements.filter((el) => el.isDeleted !== true && el.type !== 'image');
    const appState = parsed.data.appState;
    return ok({ version: 1, elements, ...(appState && Object.keys(appState).length > 0 && { appState }) });
  }
  return err(new Error(`drawing content: needs "skeleton" (shapes, labels and arrows) or "elements" (an Excalidraw scene), like ${EXAMPLE}`));
};

/** How many pictures a scene (an object or its JSON) holds, which a drawing in Remry leaves out. */
export const countImages = (input: unknown): number => {
  let value = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return 0;
    }
  }
  const elements = (value as { readonly elements?: unknown } | null)?.elements;
  return Array.isArray(elements) ? elements.filter((el) => (el as { readonly type?: unknown; readonly isDeleted?: unknown } | null)?.type === 'image' && (el as { readonly isDeleted?: unknown }).isDeleted !== true).length : 0;
};

/**
 * A scene as an `.excalidraw` file: what excalidraw.com opens from a share
 * link, and what "Save to file" writes.
 */
export const toExcalidrawFile = (scene: DrawingScene): string =>
  JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: 'remry',
    elements: scene.elements,
    appState: { viewBackgroundColor: scene.appState?.viewBackgroundColor ?? '#ffffff', gridSize: null },
    files: {}
  });

/** Reads a stored drawing; anything unreadable (never written by the app) reads as an empty one. */
export const readDrawingContent = (raw: string): DrawingContent => {
  const parsed = parseDrawingContent(raw);
  return parsed.ok ? parsed.value : emptyDrawing();
};

/** True when the drawing has nothing in it. */
export const isEmptyDrawing = (content: DrawingContent): boolean =>
  isSkeleton(content) ? content.skeleton.length === 0 : content.elements.length === 0;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Every piece of text in the drawing, in order: labels and text elements. */
export const drawingText = (content: DrawingContent): readonly string[] => {
  const texts = isSkeleton(content)
    ? content.skeleton.map((el) => (el.type === 'text' ? str(el.text) : str(el.label?.text)))
    : content.elements.map((el) => (el.type === 'text' ? str(el.originalText) || str(el.text) : ''));
  return texts.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
};

/** The drawing's text as a markdown list, for previews and plain-text uses. Empty when it has none. */
export const drawingToMarkdown = (content: DrawingContent): string =>
  drawingText(content).map((t) => `- ${t.replace(/^([#>*+-]|\d+\.)\s/, '\\$1 ')}`).join('\n');

// ---------------------------------------------------------------------------
// Layout: positions for skeleton shapes that leave out x and y.

export const SKELETON_SIZES = {
  rectangle: { width: 180, height: 80 },
  ellipse: { width: 180, height: 90 },
  diamond: { width: 200, height: 110 },
  text: { width: 160, height: 30 },
  gap: { along: 90, across: 60 }
} as const;

/** A skeleton element ready for Excalidraw: every shape has x and y, every arrow too. */
export interface PlacedSkeletonElement extends SkeletonElement {
  readonly x: number;
  readonly y: number;
  /** An arrow's or line's points, relative to x and y. */
  readonly points?: readonly (readonly [number, number])[];
}

const isShape = (el: SkeletonElement): boolean => el.type !== 'arrow' && el.type !== 'line';

/**
 * Ranks shapes along their arrows: a shape no arrow points at is rank 0, and
 * every other shape sits one past the furthest shape pointing at it (cycles
 * are broken where they're found). Shapes no arrow touches come last, on a
 * rank of their own.
 */
const rankShapes = (skeleton: readonly SkeletonElement[]): ReadonlyMap<number, number> => {
  const byId = new Map<string, number>();
  skeleton.forEach((el, i) => { if (el.id !== undefined && isShape(el)) byId.set(el.id, i); });
  const incoming = new Map<number, number[]>();
  const touched = new Set<number>();
  for (const el of skeleton) {
    if (isShape(el) || !el.start || !el.end) continue;
    const from = byId.get(el.start.id);
    const to = byId.get(el.end.id);
    if (from === undefined || to === undefined || from === to) continue;
    incoming.set(to, [...(incoming.get(to) ?? []), from]);
    touched.add(from);
    touched.add(to);
  }
  const ranks = new Map<number, number>();
  const visiting = new Set<number>();
  const rankOf = (i: number): number => {
    const known = ranks.get(i);
    if (known !== undefined) return known;
    if (visiting.has(i)) return 0;
    visiting.add(i);
    const rank = Math.max(-1, ...(incoming.get(i) ?? []).map(rankOf)) + 1;
    visiting.delete(i);
    ranks.set(i, rank);
    return rank;
  };
  const shapes = skeleton.map((el, i) => (isShape(el) ? i : -1)).filter((i) => i >= 0);
  for (const i of shapes) if (touched.has(i)) rankOf(i);
  const loose = Math.max(-1, ...ranks.values()) + 1;
  for (const i of shapes) if (!touched.has(i)) ranks.set(i, loose);
  return ranks;
};

// Roughly how wide a character and how tall a line of Excalidraw's hand-drawn
// font are at its default 20px; generous, so a label fits on its lines.
const CHAR_PX = 11;
const LINE_PX = 25;
const DEFAULT_FONT_PX = 20;

/** About how much room a piece of text takes, at its font size. */
export const textExtent = (text: string, fontSize = DEFAULT_FONT_PX): { readonly width: number; readonly height: number } => {
  const lines = text.split('\n');
  const scale = fontSize / DEFAULT_FONT_PX;
  return { width: Math.max(...lines.map((line) => line.length)) * CHAR_PX * scale, height: lines.length * LINE_PX * scale };
};

/**
 * A shape's size: as written, or its default grown to hold its label on the
 * lines it was written on. An ellipse's text area is about 70% of it, and a
 * diamond's half, so they grow more.
 */
const sizeOf = (el: SkeletonElement): { readonly width: number; readonly height: number } => {
  if (el.type === 'arrow' || el.type === 'line') return { width: el.width ?? 100, height: el.height ?? 0 };
  const base = SKELETON_SIZES[el.type];
  const text = el.type === 'text' ? el.text : el.label?.text;
  const extent = text ? textExtent(text, el.type === 'text' ? el.fontSize : el.label?.fontSize) : { width: 0, height: 0 };
  const grow = el.type === 'diamond' ? 2 : el.type === 'ellipse' ? 1.45 : 1;
  const pad = el.type === 'text' ? 0 : 40;
  return {
    width: el.width ?? Math.max(el.type === 'text' ? 0 : base.width, Math.ceil(extent.width * grow + pad)),
    height: el.height ?? Math.max(el.type === 'text' ? 0 : base.height, Math.ceil(extent.height * grow + pad))
  };
};

/** Loose shapes on their own rank wrap after this many in a row. */
const LOOSE_PER_ROW = 5;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where an arrow from one shape to another starts and ends: from the middle of
 * the edge of `from` facing `to`, to the middle of the edge of `to` facing back.
 * The longer way apart decides which edges face.
 */
export const arrowBetween = (from: Box, to: Box): { readonly x: number; readonly y: number; readonly points: readonly (readonly [number, number])[] } => {
  const fc = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const tc = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const dx = tc.x - fc.x;
  const dy = tc.y - fc.y;
  const vertical = Math.abs(dy) >= Math.abs(dx);
  const start = vertical ? { x: fc.x, y: dy >= 0 ? from.y + from.height : from.y } : { x: dx >= 0 ? from.x + from.width : from.x, y: fc.y };
  const end = vertical ? { x: tc.x, y: dy >= 0 ? to.y : to.y + to.height } : { x: dx >= 0 ? to.x : to.x + to.width, y: tc.y };
  return { x: start.x, y: start.y, points: [[0, 0], [end.x - start.x, end.y - start.y]] };
};

/**
 * Gives every shape without x and y a place, in ranks along the arrows: top to
 * bottom for `down`, left to right for `right`. Shapes with x and y keep them;
 * new places start below (or right of) them. An arrow or line bound at both
 * ends without a place of its own runs between the facing edges of its shapes
 * (Excalidraw keeps it bound as they move); any other gets 0, 0.
 */
export const layoutSkeleton = (skeleton: readonly SkeletonElement[], layout: SkeletonLayout = 'down'): readonly PlacedSkeletonElement[] => {
  const down = layout === 'down';
  const ranks = rankShapes(skeleton);
  const unplaced = skeleton.map((el, i) => (isShape(el) && (el.x === undefined || el.y === undefined) ? i : -1)).filter((i) => i >= 0);

  // Start past anything already placed.
  const placed = skeleton.filter((el) => isShape(el) && el.x !== undefined && el.y !== undefined);
  const origin = placed.length === 0 ? 0 : Math.max(...placed.map((el) => (down ? el.y! + sizeOf(el).height : el.x! + sizeOf(el).width))) + SKELETON_SIZES.gap.along;

  // Group the unplaced shapes by rank, in the order they were written; the loose
  // rank wraps into rows.
  const maxRank = Math.max(-1, ...unplaced.map((i) => ranks.get(i) ?? 0));
  const looseRank = Math.max(-1, ...[...ranks.values()]);
  const rows: number[][] = [];
  for (let r = 0; r <= maxRank; r++) {
    const members = unplaced.filter((i) => (ranks.get(i) ?? 0) === r);
    if (members.length === 0) continue;
    if (r === looseRank && members.length > LOOSE_PER_ROW) {
      for (let k = 0; k < members.length; k += LOOSE_PER_ROW) rows.push(members.slice(k, k + LOOSE_PER_ROW));
    } else rows.push(members);
  }

  const positions = new Map<number, { x: number; y: number }>();
  const thickness = rows.map((row) => Math.max(...row.map((i) => (down ? sizeOf(skeleton[i]!).height : sizeOf(skeleton[i]!).width))));
  const lengths = rows.map((row) => row.reduce((sum, i) => sum + (down ? sizeOf(skeleton[i]!).width : sizeOf(skeleton[i]!).height), 0) + (row.length - 1) * SKELETON_SIZES.gap.across);
  const widest = Math.max(0, ...lengths);
  let along = origin;
  rows.forEach((row, r) => {
    // Each row is centred on the widest one.
    let across = (widest - lengths[r]!) / 2;
    for (const i of row) {
      const s = sizeOf(skeleton[i]!);
      const offset = ((thickness[r]!) - (down ? s.height : s.width)) / 2;
      positions.set(i, down ? { x: across, y: along + offset } : { x: along + offset, y: across });
      across += (down ? s.width : s.height) + SKELETON_SIZES.gap.across;
    }
    along += thickness[r]! + SKELETON_SIZES.gap.along;
  });

  const shapes = skeleton.map((el, i): PlacedSkeletonElement => {
    const at = positions.get(i);
    if (at) return { ...el, x: el.x ?? at.x, y: el.y ?? at.y, width: el.width ?? sizeOf(el).width, height: el.height ?? sizeOf(el).height };
    return { ...el, x: el.x ?? 0, y: el.y ?? 0, ...(isShape(el) && { width: sizeOf(el).width, height: sizeOf(el).height }) };
  });
  const boxes = new Map(shapes.flatMap((el) => (el.id !== undefined && isShape(el) ? [[el.id, el as Box] as const] : [])));
  return shapes.map((el, i) => {
    const written = skeleton[i]!;
    if (isShape(el) || written.x !== undefined || written.y !== undefined) return el;
    const from = el.start ? boxes.get(el.start.id) : undefined;
    const to = el.end ? boxes.get(el.end.id) : undefined;
    if (!from || !to || from === to) return el;
    const route = arrowBetween(from, to);
    const [dx, dy] = route.points[1]!;
    return { ...el, x: route.x, y: route.y, width: Math.abs(dx), height: Math.abs(dy), points: route.points };
  });
};
