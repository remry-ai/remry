// Drawing embeds in rendered markdown: each ```drawing block (its body a drawing
// page's path, see $shared/types/drawing-blocks) becomes a picture of that
// page's drawing, with its title linking to the page. MarkdownRenderer runs it
// after charts. Excalidraw loads only when a block is there.

import { trpc } from '$shared/trpc/client';
import { drawingBlockPageId } from '$shared/types/drawing-blocks';
import { isSkeleton, readDrawingContent } from '$shared/utils/drawing';
import { entityPath } from '$shared/utils/entity';
import { renderDrawing } from './render-drawing';

export interface DrawingPage {
  readonly title: string;
  readonly bodyType: string;
  readonly content: string;
}

/** A drawing page, or why it can't be shown. */
export const loadDrawingPage = async (id: string): Promise<DrawingPage | string> => {
  try {
    const result = await trpc().page.get.query({ id });
    if (!result.ok) return result.error.message;
    if (result.value.bodyType !== 'drawing') return `“${result.value.title}” isn't a drawing`;
    return result.value;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

const note = (className: string, text: string): HTMLElement => {
  const el = document.createElement('p');
  el.className = className;
  el.textContent = text;
  return el;
};

/** Replaces the drawing blocks in `container` with their drawings; the returned function frees their images. */
export const mountDrawings = async (container: HTMLElement, isCancelled: () => boolean = () => false): Promise<() => void> => {
  const codes = [...container.querySelectorAll<HTMLElement>('pre > code.language-drawing')];
  const urls: string[] = [];
  const release = () => { for (const url of urls) URL.revokeObjectURL(url); };
  for (const code of codes) {
    const pre = code.parentElement;
    if (!pre) continue;
    const pageId = drawingBlockPageId(code.textContent ?? '');
    const figure = document.createElement('figure');
    figure.className = 'drawing-embed';
    pre.replaceWith(figure);
    if (!pageId) {
      figure.append(note('drawing-error', 'This drawing block names no drawing page: its body should be a path like /app/wiki/<id>.'));
      continue;
    }
    figure.append(note('drawing-loading text-sm muted', 'Loading the drawing…'));
    const page = await loadDrawingPage(pageId);
    if (isCancelled()) break;
    figure.replaceChildren();
    if (typeof page === 'string') {
      figure.append(note('drawing-error', `This drawing couldn't be shown: ${page}`));
      continue;
    }
    let rendered: Awaited<ReturnType<typeof renderDrawing>>;
    try {
      const drawing = readDrawingContent(page.content);
      // On screen it sits on the page's own background, unless it has a colour of its own.
      const ownBackground = !isSkeleton(drawing) && drawing.appState?.viewBackgroundColor !== undefined;
      rendered = await renderDrawing(drawing, { scale: 2, background: ownBackground });
    } catch (e) {
      figure.append(note('drawing-error', `This drawing couldn't be shown: ${e instanceof Error ? e.message : String(e)}`));
      continue;
    }
    if (isCancelled()) break;
    if (rendered) {
      const url = URL.createObjectURL(rendered.blob);
      urls.push(url);
      const img = document.createElement('img');
      img.src = url;
      img.alt = page.title;
      img.width = Math.round(rendered.width);
      figure.append(img);
    } else {
      figure.append(note('drawing-empty text-sm muted', 'This drawing is empty.'));
    }
    const caption = document.createElement('figcaption');
    caption.className = 'drawing-caption text-xs no-print';
    const link = document.createElement('a');
    link.href = entityPath('PAGE', pageId);
    link.textContent = page.title;
    caption.append(link);
    figure.append(caption);
  }
  return release;
};
