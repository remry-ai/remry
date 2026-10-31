// Converting a file uploaded as a link (`storage://<key>`) into the text of the doc or wiki page it
// sits on, with the local Claude Code CLI, as `doc.convertPdf` does for a doc's attached PDF. The
// converter comes from the HTTP tRPC context; the CLI and MCP have none, so there Claude reads the
// file and writes the text itself.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable } from '$api/_archive';
import { CLAUDE_NOT_FOUND_WARNING } from '$shared/assist/claude-cli';
import type { ConvertPdfResult, PdfConversionStatus, PdfConverter } from '$shared/types/pdf-conversion';
import { entityFileFolder, fileLinkKey } from '$shared/utils/file-links';
import { updateDoc } from '$api/attached/doc/operations';
import { updatePage } from '$api/page/operations';

/** One job per doc or page (`<notebookId>/DOC:<id>`), apart from a doc's PDF conversion (`<notebookId>/<docId>`). */
export const fileJobKey = (notebookId: string, entityType: string, entityId: string): string => `${notebookId}/${entityType}:${entityId}`;

/** Starts writing the link's doc or page from its file in the background; poll `getFileLinkConversion`. */
export const convertFileLink = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger' | 'now' | 'uuid'>,
  converter: PdfConverter | undefined,
  notebookId: string,
  linkId: string
): Promise<Result<ConvertPdfResult>> => {
  const claudePath = converter?.locate() ?? null;
  if (!converter || !claudePath) return ok({ started: false, warning: CLAUDE_NOT_FOUND_WARNING });

  const link = await reg.prisma.link.findUnique({ where: { id: linkId } });
  if (!link) return err(new Error('Link not found'));
  // Only a doc or a document page has text to write; a person's or project's files are kept as they are.
  if (link.entityType !== 'DOC' && link.entityType !== 'PAGE') return err(new Error('Only a doc or a wiki page can be written from a file.'));
  const key = fileLinkKey(link.url);
  const folder = entityFileFolder(link.entityType, link.entityId);
  if (!key || !folder || !key.startsWith(`${folder}/`)) return err(new Error('Only a file uploaded to a doc or wiki page can be converted.'));
  if (link.entityType === 'PAGE') {
    const page = await reg.prisma.page.findUnique({ where: { id: link.entityId }, select: { bodyType: true } });
    if (page?.bodyType === 'sheet') return err(new Error("A spreadsheet page can't be written from a file."));
  }
  const writable = await ensureWritable(reg, link.entityType, link.entityId);
  if (!writable.ok) return err(writable.error);
  const path = reg.storage.pathFor(key);
  if (!path) return err(new Error("The file isn't in this notebook's files folder."));

  const { entityType, entityId } = link;
  converter.start({
    key: fileJobKey(notebookId, entityType, entityId),
    claudePath,
    pdfPath: path,
    onMarkdown: (markdown) => (entityType === 'DOC' ? updateDoc(reg, entityId, { content: markdown }) : updatePage(reg, entityId, { content: markdown }))
  });
  return ok({ started: true });
};

export const getFileLinkConversion = (
  converter: PdfConverter | undefined,
  notebookId: string,
  entityType: string,
  entityId: string
): Result<PdfConversionStatus> =>
  ok(converter ? converter.status(fileJobKey(notebookId, entityType, entityId)) : { state: 'idle' });
