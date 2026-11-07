// What a doc's or wiki page's print page hands PrintView, as markdown: a
// document as it is, a spreadsheet as a table of the values its cells showed,
// and a drawing as its picture, drawn here as a PNG and then shown (and put in
// the PDF) like any image, at its own size. Call it while a component starts.

import { bodyMarkdown } from '$shared/utils/body';
import { isSkeleton, readDrawingContent } from '$shared/utils/drawing';
import type { BodyType } from '$shared/types/body-types';
import { renderDrawing } from '$lib/drawing/render-drawing';

export interface PrintableSource {
  readonly bodyType: BodyType;
  readonly content: string;
  readonly title: string;
}

export const printableBody = (source: () => PrintableSource): { readonly markdown: string } => {
  let drawing = $state<string | null>(null);

  $effect(() => {
    const { bodyType, content, title } = source();
    if (bodyType !== 'drawing') return;
    const scene = readDrawingContent(content);
    let cancelled = false;
    let url: string | null = null;
    drawing = null;
    renderDrawing(scene, { scale: 3, background: !isSkeleton(scene) && scene.appState?.viewBackgroundColor !== undefined }).then(
      (rendered) => {
        if (cancelled) return;
        if (!rendered) {
          drawing = '*Nothing drawn yet.*';
          return;
        }
        url = URL.createObjectURL(rendered.blob);
        drawing = `![${title.replace(/[[\]]/g, '')}](${url} "w=${Math.round(rendered.width)}")`;
      },
      (e: unknown) => { if (!cancelled) drawing = `*The drawing couldn't be drawn: ${e instanceof Error ? e.message : String(e)}*`; }
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  });

  const markdown = $derived.by(() => {
    const { bodyType, content } = source();
    // A drawing prints as its picture; anything else as bodyMarkdown, as everywhere else.
    if (bodyType === 'drawing') return drawing ?? '*Drawing…*';
    return bodyMarkdown(bodyType, content);
  });

  return { get markdown() { return markdown; } };
};
