// A ```drawing block naming a drawing page, from when drawings could sit inside
// other text (0.16.82–0.16.83): it now shows as a link to that page, which shows
// the drawing. Anything else in such a block stays a code block. No fetch.

import { drawingBlockPageId } from '$shared/types/drawing-blocks';
import { entityPath } from '$shared/utils/entity';

export const linkDrawingBlocks = (container: HTMLElement): void => {
  for (const code of container.querySelectorAll<HTMLElement>('pre > code.language-drawing')) {
    const pre = code.parentElement;
    const pageId = drawingBlockPageId(code.textContent ?? '');
    if (!pre || !pageId) continue;
    const link = document.createElement('a');
    link.href = entityPath('PAGE', pageId);
    link.textContent = 'Drawing ↗';
    link.title = 'Open the drawing';
    const line = document.createElement('p');
    line.className = 'drawing-link';
    line.append(link);
    pre.replaceWith(line);
  }
};
