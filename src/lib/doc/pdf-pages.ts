// Pure layout for a doc's PDF: where to cut the rendered page into A4 pages, and what to call the file.

export const A4 = { width: 210, height: 297, margin: 14 } as const;

const PAGE_BREAK_LINE = /^\s*<!--\s*page-?break\s*-->\s*$/i;
const FENCE = /^\s*(```|~~~)/;

/** The element a `<!-- pagebreak -->` line becomes on the print page. */
export const PAGE_BREAK_HTML = '<div class="page-break" aria-hidden="true"></div>';

/**
 * Turns each `<!-- pagebreak -->` line (outside code blocks) into a page-break element,
 * which starts a new page in the PDF and when printing. Elsewhere the comment stays invisible.
 */
export const markPageBreaks = (content: string): string => {
  let fence: string | null = null;
  return content
    .split('\n')
    .map((line) => {
      const opener = FENCE.exec(line)?.[1] ?? null;
      if (opener && (fence === null || fence === opener)) fence = fence === null ? opener : null;
      return fence === null && PAGE_BREAK_LINE.test(line) ? `\n${PAGE_BREAK_HTML}\n` : line;
    })
    .join('\n');
};

/**
 * Where each page starts, in pixels from the top of the rendered doc. A declared page
 * break always starts a page. Otherwise a page ends at the last block (paragraph, table,
 * chart…) that fits, so blocks aren't cut in two; only a block that would leave most of
 * the page empty, or is taller than a page, is cut.
 */
export const planPageStarts = (
  blockBottoms: readonly number[],
  totalHeight: number,
  pageHeight: number,
  forcedBreaks: readonly number[] = []
): readonly number[] => {
  const bottoms = [...blockBottoms].sort((a, b) => a - b);
  const forced = [...forcedBreaks].sort((a, b) => a - b);
  const starts = [0];
  let start = 0;
  for (;;) {
    const limit = start + pageHeight;
    const declared = forced.find((f) => f > start && f <= Math.min(limit, totalHeight - 1));
    if (declared !== undefined) {
      start = declared;
    } else if (totalHeight - start > pageHeight) {
      const fit = bottoms.filter((b) => b > start && b <= limit).at(-1);
      start = fit !== undefined && fit - start >= pageHeight / 2 ? fit : limit;
    } else {
      return starts;
    }
    starts.push(start);
  }
};

/** A file name for the PDF: the title without characters that trouble file systems. */
export const pdfFileName = (title: string): string => {
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `${cleaned || 'document'}.pdf`;
};
