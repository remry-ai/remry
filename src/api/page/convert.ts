// Converting a wiki page's source file to markdown in the web app, with the local Claude Code
// CLI, as `doc.convertPdf` does for a doc. The converter comes from the HTTP tRPC context; the
// CLI and MCP have none, so there Claude reads the file and writes the page itself.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable } from '$api/_archive';
import { CLAUDE_NOT_FOUND_WARNING } from '$shared/assist/claude-cli';
import type { ConvertPdfResult, PdfConversionStatus, PdfConverter } from '$shared/types/pdf-conversion';
import { updatePage } from './operations';

/** One job per page, apart from the docs' (`<notebookId>/<docId>`). */
export const pageJobKey = (notebookId: string, pageId: string): string => `${notebookId}/page:${pageId}`;

/** Starts converting the page's source file in the background; poll `getPageConversion`. */
export const convertPageSource = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger' | 'now' | 'uuid'>,
  converter: PdfConverter | undefined,
  notebookId: string,
  id: string
): Promise<Result<ConvertPdfResult>> => {
  const claudePath = converter?.locate() ?? null;
  if (!converter || !claudePath) return ok({ started: false, warning: CLAUDE_NOT_FOUND_WARNING });

  const page = await reg.prisma.page.findUnique({ where: { id }, select: { sourceUrl: true, bodyType: true } });
  if (!page) return err(new Error(`Page ${id} not found`));
  if (!page.sourceUrl) return err(new Error('This page has no source file attached. Attach one, then convert it.'));
  if (page.bodyType !== 'doc') return err(new Error("A spreadsheet page can't be written from a file. Convert it into a document page instead."));
  const writable = await ensureWritable(reg, 'PAGE', id);
  if (!writable.ok) return err(writable.error);

  const path = reg.storage.pathFor(page.sourceUrl);
  if (!path) return err(new Error("The page's source file isn't in this notebook's files folder."));

  converter.start({
    key: pageJobKey(notebookId, id),
    claudePath,
    pdfPath: path,
    onMarkdown: (markdown) => updatePage(reg, id, { content: markdown })
  });
  return ok({ started: true });
};

export const getPageConversion = (
  converter: PdfConverter | undefined,
  notebookId: string,
  id: string
): Result<PdfConversionStatus> =>
  ok(converter ? converter.status(pageJobKey(notebookId, id)) : { state: 'idle' });
