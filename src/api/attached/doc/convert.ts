// Converting a doc's attached PDF to markdown in the web app, with the local
// Claude Code CLI. The converter comes from the HTTP tRPC context, never the
// Registry; the CLI and MCP have none, so there Claude converts the PDF itself.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable } from '$api/_archive';
import { CLAUDE_NOT_FOUND_WARNING } from '$shared/assist/claude-cli';
import type { ConvertPdfResult, PdfConversionStatus, PdfConverter } from '$shared/types/pdf-conversion';
import { updateDoc } from './operations';

export const pdfJobKey = (notebookId: string, docId: string): string => `${notebookId}/${docId}`;

/**
 * Starts converting the doc's PDF in the background and returns at once. Poll
 * `getPdfConversion` for the outcome. Without the `claude` CLI the result is a
 * warning, not an error: the PDF is still attached.
 */
export const convertDocPdf = async (
  reg: Pick<Registry, 'prisma' | 'storage'>,
  converter: PdfConverter | undefined,
  notebookId: string,
  id: string
): Promise<Result<ConvertPdfResult>> => {
  const claudePath = converter?.locate() ?? null;
  if (!converter || !claudePath) return ok({ started: false, warning: CLAUDE_NOT_FOUND_WARNING });

  const doc = await reg.prisma.doc.findUnique({ where: { id } });
  if (!doc) return err(new Error('Doc not found'));
  if (!doc.sourceUrl) return err(new Error('This doc has no PDF attached. Attach one, then convert it.'));
  const writable = await ensureWritable(reg, doc.entityType, doc.entityId);
  if (!writable.ok) return err(writable.error);

  const pdfPath = reg.storage.pathFor(doc.sourceUrl);
  if (!pdfPath) return err(new Error("The doc's PDF isn't in this notebook's files folder."));

  converter.start({
    key: pdfJobKey(notebookId, id),
    claudePath,
    pdfPath,
    onMarkdown: (markdown) => updateDoc(reg, id, { content: markdown })
  });
  return ok({ started: true });
};

export const getPdfConversion = (
  converter: PdfConverter | undefined,
  notebookId: string,
  id: string
): Result<PdfConversionStatus> =>
  ok(converter ? converter.status(pdfJobKey(notebookId, id)) : { state: 'idle' });
