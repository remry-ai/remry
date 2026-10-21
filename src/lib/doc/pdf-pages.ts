// Pure layout for a doc's PDF: where to cut the rendered page into A4 pages, and what to call the file.

export const A4 = { width: 210, height: 297, margin: 14 } as const;

// A leading backslash is how the editor saved a page break typed into it, before 0.16.38.
const PAGE_BREAK_LINE = /^\s*\\?<!--\s*page-?break\s*-->\s*$/i;
const FENCE = /^\s*(```|~~~)/;

/** The element a `<!-- pagebreak -->` line becomes on the print page. */
export const PAGE_BREAK_HTML = '<div class="page-break" aria-hidden="true"></div>';

/** Rewrites each line outside fenced code blocks. */
const mapOutsideFences = (content: string, rewrite: (line: string) => string): string => {
  let fence: string | null = null;
  return content
    .split('\n')
    .map((line) => {
      const opener = FENCE.exec(line)?.[1] ?? null;
      if (opener && (fence === null || fence === opener)) fence = fence === null ? opener : null;
      return fence === null ? rewrite(line) : line;
    })
    .join('\n');
};

/**
 * Turns each `<!-- pagebreak -->` line (outside code blocks) into a page-break element,
 * which starts a new page in the PDF and when printing. Elsewhere the comment stays invisible.
 */
export const markPageBreaks = (content: string): string =>
  mapOutsideFences(content, (line) => (PAGE_BREAK_LINE.test(line) ? `\n${PAGE_BREAK_HTML}\n` : line));

const BR_LINE = /^\s*(<br\s*\/?\s*>\s*)+$/i;

/**
 * Puts blank lines around a line that's only `<br>`s (outside code blocks). Markdown reads such a
 * line as the start of a raw HTML block, which runs to the next blank line, so the lines after it
 * showed their markdown as text (`**Owner:**` with its stars). Written for spacing, it keeps that.
 */
export const separateBreakLines = (content: string): string =>
  mapOutsideFences(content, (line) => (BR_LINE.test(line) ? `\n${line.trim()}\n` : line));

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
  // eslint-disable-next-line no-control-regex -- control characters are what it removes
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `${cleaned || 'document'}.pdf`;
};
