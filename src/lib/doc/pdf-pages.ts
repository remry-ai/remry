// Pure helpers for a doc's print page and PDF: page break lines, `<br>` lines, and the file's name.

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

/** Each `<!-- pagebreak -->` line (outside code blocks) as a plain one on its own, which the PDF reads as a page break. */
export const normalizePageBreaks = (content: string): string =>
  mapOutsideFences(content, (line) => (PAGE_BREAK_LINE.test(line) ? '\n<!-- pagebreak -->\n' : line));

const BR_LINE = /^\s*(<br\s*\/?\s*>\s*)+$/i;

/**
 * Puts blank lines around a line that's only `<br>`s (outside code blocks). Markdown reads such a
 * line as the start of a raw HTML block, which runs to the next blank line, so the lines after it
 * showed their markdown as text (`**Owner:**` with its stars). Written for spacing, it keeps that.
 */
export const separateBreakLines = (content: string): string =>
  mapOutsideFences(content, (line) => (BR_LINE.test(line) ? `\n${line.trim()}\n` : line));

/** A file name for the PDF: the title without characters that trouble file systems. */
export const pdfFileName = (title: string): string => {
  // eslint-disable-next-line no-control-regex -- control characters are what it removes
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `${cleaned || 'document'}.pdf`;
};
