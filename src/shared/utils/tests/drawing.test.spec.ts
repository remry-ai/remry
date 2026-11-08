import { describe, it, expect } from 'vitest';
import {
  arrowBetween,
  colorSkeleton,
  countImages,
  toExcalidrawFile,
  DRAWING_LIMITS,
  drawingText,
  drawingToMarkdown,
  emptyDrawing,
  isEmptyDrawing,
  layoutSkeleton,
  parseDrawingContent,
  readDrawingContent,
  SKELETON_SIZES,
  textExtent,
  type DrawingContent,
  type SkeletonElement
} from '../drawing';

const parsed = (input: unknown): DrawingContent => {
  const result = parseDrawingContent(input);
  if (!result.ok) throw result.error;
  return result.value;
};

const errorOf = (input: unknown): string => {
  const result = parseDrawingContent(input);
  if (result.ok) throw new Error('expected an error');
  return result.error.message;
};

const flow: readonly SkeletonElement[] = [
  { type: 'rectangle', id: 'a', label: { text: 'Start' } },
  { type: 'diamond', id: 'b', label: { text: 'Ready?' } },
  { type: 'ellipse', id: 'c', label: { text: 'Done' } },
  { type: 'arrow', start: { id: 'a' }, end: { id: 'b' } },
  { type: 'arrow', start: { id: 'b' }, end: { id: 'c' }, label: { text: 'yes' } }
];

describe('parseDrawingContent', () => {
  it('reads an empty string as an empty drawing', () => {
    expect(parsed('')).toEqual(emptyDrawing());
  });

  it('keeps a skeleton as written, with its layout', () => {
    expect(parsed(JSON.stringify({ skeleton: flow, layout: 'right' }))).toEqual({ version: 1, skeleton: flow, layout: 'right' });
  });

  it('keeps a scene, dropping deleted elements, files and default app state', () => {
    const scene = {
      type: 'excalidraw',
      version: 1,
      elements: [{ id: '1', type: 'rectangle', x: 1 }, { id: '2', type: 'text', text: 'gone', isDeleted: true }],
      appState: { viewBackgroundColor: '#fafafa', zoom: { value: 2 } },
      files: {}
    };
    expect(parsed(scene)).toEqual({ version: 1, elements: [{ id: '1', type: 'rectangle', x: 1 }], appState: { viewBackgroundColor: '#fafafa' } });
  });

  it('reads an .excalidraw file, leaving out its pictures', () => {
    const file = {
      type: 'excalidraw',
      version: 2,
      source: 'https://excalidraw.com',
      elements: [{ id: '1', type: 'ellipse' }, { id: '2', type: 'image', fileId: 'f1' }],
      appState: { gridSize: 20, viewBackgroundColor: '#ffffff' },
      files: { f1: { dataURL: 'data:image/png;base64,AA' } }
    };
    expect(countImages(file)).toBe(1);
    expect(countImages(JSON.stringify(file))).toBe(1);
    expect(parsed(JSON.stringify(file))).toEqual({ version: 1, elements: [{ id: '1', type: 'ellipse' }], appState: { gridSize: 20, viewBackgroundColor: '#ffffff' } });
  });

  it('writes a scene as an .excalidraw file', () => {
    const file = JSON.parse(toExcalidrawFile({ version: 1, elements: [{ id: '1', type: 'text', text: 'Hi' }], appState: { viewBackgroundColor: '#fafafa' } }));
    expect(file).toMatchObject({ type: 'excalidraw', version: 2, elements: [{ id: '1' }], appState: { viewBackgroundColor: '#fafafa' }, files: {} });
    expect(parsed(file)).toMatchObject({ elements: [{ id: '1', text: 'Hi' }] });
  });

  it('names the element and field that is wrong', () => {
    expect(errorOf({ skeleton: [{ type: 'hexagon' }] })).toMatch(/skeleton\.0\.type/);
    expect(errorOf({ skeleton: [{ type: 'text' }] })).toMatch(/skeleton\.0\.text is required/);
    expect(errorOf({ skeleton: [{ type: 'rectangle', text: 'x' }] })).toMatch(/"label"/);
    expect(errorOf({ skeleton: [{ type: 'arrow', start: { id: 'nope' } }] })).toMatch(/skeleton\.0\.start\.id "nope" isn't the id/);
    expect(errorOf({ skeleton: [{ type: 'rectangle', id: 'a' }, { type: 'ellipse', id: 'a' }] })).toMatch(/used twice/);
    expect(errorOf({ skeleton: [{ type: 'rectangle', colour: 'red' }] })).toMatch(/Unrecognized key/);
  });

  it('refuses something that is neither, with an example', () => {
    expect(errorOf('{"shapes":[]}')).toMatch(/needs "skeleton".*"elements"/);
    expect(errorOf('not json')).toMatch(/invalid JSON/);
    expect(errorOf('x'.repeat(DRAWING_LIMITS.bytes + 1))).toMatch(/over the limit/);
  });

  it('reads anything unreadable as empty', () => {
    expect(readDrawingContent('{')).toEqual(emptyDrawing());
  });
});

describe('drawing text', () => {
  it("lists a skeleton's labels and text in order", () => {
    const drawing = parsed({ skeleton: [...flow, { type: 'text', text: '  A   note ' }] });
    expect(drawingText(drawing)).toEqual(['Start', 'Ready?', 'Done', 'yes', 'A note']);
    expect(drawingToMarkdown(drawing)).toBe('- Start\n- Ready?\n- Done\n- yes\n- A note');
  });

  it("reads a scene's text elements, as written rather than wrapped", () => {
    const drawing = parsed({ elements: [{ id: '1', type: 'text', text: 'Hello\nworld', originalText: 'Hello world' }, { id: '2', type: 'rectangle' }] });
    expect(drawingText(drawing)).toEqual(['Hello world']);
  });

  it('escapes text that would read as markdown', () => {
    expect(drawingToMarkdown(parsed({ skeleton: [{ type: 'text', text: '# Big' }] }))).toBe('- \\# Big');
  });

  it('knows an empty drawing', () => {
    expect(isEmptyDrawing(emptyDrawing())).toBe(true);
    expect(isEmptyDrawing(parsed({ skeleton: [] }))).toBe(true);
    expect(isEmptyDrawing(parsed({ skeleton: flow }))).toBe(false);
  });
});

describe('shape sizes', () => {
  it('grow a shape to hold its label, a diamond most', () => {
    const [rect, diamond, small, sized] = layoutSkeleton([
      { type: 'rectangle', label: { text: 'A rather long label for a box' } },
      { type: 'diamond', label: { text: 'Signed in?' } },
      { type: 'rectangle', label: { text: 'API' } },
      { type: 'rectangle', width: 50, height: 40, label: { text: 'A rather long label for a box' } }
    ]);
    expect(rect!.width).toBeGreaterThan(textExtent('A rather long label for a box').width);
    expect(diamond!.width).toBeGreaterThanOrEqual(textExtent('Signed in?').width * 2);
    expect(small).toMatchObject({ width: SKELETON_SIZES.rectangle.width, height: SKELETON_SIZES.rectangle.height });
    expect(sized).toMatchObject({ width: 50, height: 40 });
  });
});

describe('arrowBetween', () => {
  const box = (x: number, y: number) => ({ x, y, width: 100, height: 50 });

  it('joins the facing edges: below, above, beside', () => {
    expect(arrowBetween(box(0, 0), box(0, 200))).toEqual({ x: 50, y: 50, points: [[0, 0], [0, 150]] });
    expect(arrowBetween(box(0, 200), box(0, 0))).toEqual({ x: 50, y: 200, points: [[0, 0], [0, -150]] });
    expect(arrowBetween(box(0, 0), box(300, 0))).toEqual({ x: 100, y: 25, points: [[0, 0], [200, 0]] });
  });
});

describe('layoutSkeleton', () => {
  it('ranks shapes down along their arrows, centred on the widest rank', () => {
    const placed = layoutSkeleton([...flow, { type: 'rectangle', id: 'd', label: { text: 'Retry' } }, { type: 'arrow', start: { id: 'b' }, end: { id: 'd' } }]);
    const at = (id: string) => placed.find((el) => el.id === id)!;
    expect(at('a').y).toBeLessThan(at('b').y);
    expect(at('b').y).toBeLessThan(at('c').y);
    // c and d share a rank, side by side.
    expect(at('c').y + (at('c').height ?? 0) / 2).toBe(at('d').y + (at('d').height ?? 0) / 2);
    expect(at('c').x).toBeLessThan(at('d').x);
    // a is centred over the rank of two.
    const rankWidth = at('d').x + (at('d').width ?? 0) - at('c').x;
    expect(at('a').x + (at('a').width ?? 0) / 2).toBeCloseTo(at('c').x + rankWidth / 2);
    // An arrow runs from the bottom of one shape to the top of the next.
    const ab = placed.find((el) => el.type === 'arrow' && el.start?.id === 'a')!;
    expect(ab).toMatchObject({ x: at('a').x + (at('a').width ?? 0) / 2, y: at('a').y + (at('a').height ?? 0) });
    expect(ab.points?.[1]?.[1]).toBe(at('b').y - ab.y);
  });

  it('runs left to right for layout right', () => {
    const placed = layoutSkeleton(flow, 'right');
    expect(placed[0]!.x).toBeLessThan(placed[1]!.x);
    expect(placed[1]!.x).toBeLessThan(placed[2]!.x);
  });

  it('leaves an arrow with a place of its own, or one end, where it was written', () => {
    const placed = layoutSkeleton([{ type: 'rectangle', id: 'a' }, { type: 'arrow', x: 5, y: 6, start: { id: 'a' }, end: { id: 'a' } }, { type: 'arrow', start: { id: 'a' } }]);
    expect(placed[1]).toMatchObject({ x: 5, y: 6 });
    expect(placed[1]!.points).toBeUndefined();
    expect(placed[2]).toMatchObject({ x: 0, y: 0 });
  });

  it('keeps written positions and places the rest after them', () => {
    const placed = layoutSkeleton([{ type: 'rectangle', id: 'a', x: 10, y: 500 }, { type: 'rectangle', id: 'b' }]);
    expect(placed[0]).toMatchObject({ x: 10, y: 500 });
    expect(placed[1]!.y).toBe(500 + SKELETON_SIZES.rectangle.height + SKELETON_SIZES.gap.along);
  });

  it('survives a cycle and wraps shapes no arrow touches', () => {
    const cycle: SkeletonElement[] = [
      { type: 'rectangle', id: 'a' },
      { type: 'rectangle', id: 'b' },
      { type: 'arrow', start: { id: 'a' }, end: { id: 'b' } },
      { type: 'arrow', start: { id: 'b' }, end: { id: 'a' } },
      ...Array.from({ length: 7 }, (): SkeletonElement => ({ type: 'ellipse' }))
    ];
    const placed = layoutSkeleton(cycle);
    expect(placed.every((el) => Number.isFinite(el.x) && Number.isFinite(el.y))).toBe(true);
    const loose = placed.filter((el) => el.type === 'ellipse');
    expect(new Set(loose.map((el) => el.y)).size).toBe(2);
  });
});

describe('colorSkeleton', () => {
  const colors = { stroke: '#1d4ed8', fill: '#dbe4f9' };
  const content = {
    version: 1 as const,
    skeleton: [
      { type: 'rectangle' as const, id: 'a' },
      { type: 'ellipse' as const, id: 'b', strokeColor: '#e03131', backgroundColor: '#ffc9c9', fillStyle: 'hachure' as const },
      { type: 'arrow' as const, start: { id: 'a' }, end: { id: 'b' } },
      { type: 'text' as const, text: 'Note' }
    ]
  };

  it('colours what Claude left uncoloured, and keeps colours it set', () => {
    const [plain, set, arrow, text] = colorSkeleton(content, colors).skeleton;
    expect(plain).toMatchObject({ strokeColor: '#1d4ed8', backgroundColor: '#dbe4f9', fillStyle: 'solid' });
    expect(set).toMatchObject({ strokeColor: '#e03131', backgroundColor: '#ffc9c9', fillStyle: 'hachure' });
    expect(arrow).toMatchObject({ strokeColor: '#1d4ed8' });
    expect(text).toEqual({ type: 'text', text: 'Note' });
  });

  it('leaves a skeleton alone without a branding', () => {
    expect(colorSkeleton(content, null)).toBe(content);
  });
});
