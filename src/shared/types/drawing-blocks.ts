// A drawing embedded in markdown: a fenced `drawing` block whose body names a
// drawing page, by its app path or its id:
//
//   ```drawing
//   /app/wiki/<pageId>
//   ```
//
// Docs, notes and pages show the drawing there (on screen and in PDFs), and the
// block counts as a MENTIONS link to the page. Pure, shared by both sides.

import { parseEntityPath } from '$shared/utils/entity';

export interface DrawingBlock {
  /** 1-based line of the opening fence. */
  readonly line: number;
  readonly source: string;
  /** The drawing page it names, or null when its body names no page. */
  readonly pageId: string | null;
}

const FENCE = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/;
const BARE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** The page a drawing block names: `/app/wiki/<id>` (or a full link to it), or a bare id. */
export const drawingBlockPageId = (source: string): string | null => {
  const body = source.trim();
  if (!body || body.includes('\n')) return null;
  const ref = parseEntityPath(body);
  if (ref) return ref.entityType === 'PAGE' ? ref.entityId : null;
  return BARE_ID.test(body) ? body : null;
};

/** The fenced `drawing` blocks in markdown, in order. */
export const extractDrawingBlocks = (markdown: string): readonly DrawingBlock[] => {
  const lines = markdown.split('\n');
  const blocks: DrawingBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i]!);
    if (!open) continue;
    const fence = open[1]!;
    const isDrawing = open[2] === 'drawing';
    const start = i;
    const body: string[] = [];
    i++;
    const closing = new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`);
    while (i < lines.length && !closing.test(lines[i]!)) {
      body.push(lines[i]!);
      i++;
    }
    if (isDrawing) {
      const source = body.join('\n');
      blocks.push({ line: start + 1, source, pageId: drawingBlockPageId(source) });
    }
  }
  return blocks;
};

/** The markdown that embeds a drawing page. */
export const drawingBlock = (pageId: string): string => `\`\`\`drawing\n/app/wiki/${pageId}\n\`\`\``;
