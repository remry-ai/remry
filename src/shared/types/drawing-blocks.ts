// A fenced `drawing` block naming a drawing page, by its app path or its id:
//
//   ```drawing
//   /app/wiki/<pageId>
//   ```
//
// From 0.16.82 to 0.16.83 such a block showed the drawing inside a doc, note
// or page. Drawings are now only their own pages, so an old block shows as a
// link to the page (lib/drawing/drawing-links.ts, and a line in the PDF) and
// still counts as a MENTIONS link. Pure, shared by both sides.

import { parseEntityPath } from '$shared/utils/entity';

const BARE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** The page a drawing block names: `/app/wiki/<id>` (or a full link to it), or a bare id. */
export const drawingBlockPageId = (source: string): string | null => {
  const body = source.trim();
  if (!body || body.includes('\n')) return null;
  const ref = parseEntityPath(body);
  if (ref) return ref.entityType === 'PAGE' ? ref.entityId : null;
  return BARE_ID.test(body) ? body : null;
};
