// The web app's local Claude Code CLI on a file uploaded as a link (`storage://<key>`): saving the
// file's text on the link (transcribe; "Re-read"), and writing the doc or wiki page it sits on
// from it (convert), which saves the link's text too, so one run does both. The converter comes
// from the HTTP tRPC context; the CLI and MCP have none, so there Claude reads the file itself and
// saves its text with link.update.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable } from '$api/_archive';
import { CLAUDE_NOT_FOUND_WARNING } from '$shared/assist/claude-cli';
import type { ConvertPdfResult, PdfConversionStatus, PdfConverter } from '$shared/types/pdf-conversion';
import { entityFileFolder, fileLinkKey } from '$shared/utils/file-links';
import { updateDoc } from '$api/attached/doc/operations';
import { updatePage } from '$api/page/operations';

type ConvertReg = Pick<Registry, 'prisma' | 'storage' | 'logger' | 'now' | 'uuid'>;

/** One job per doc, page or link: `<notebookId>/DOC:<id>`, `…/PAGE:<id>`, `…/LINK:<id>`. */
export const fileJobKey = (notebookId: string, entityType: string, entityId: string): string => `${notebookId}/${entityType}:${entityId}`;

interface FileLink {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly text: string | null;
  readonly key: string;
}

/** The link and its file's key, when it's a file uploaded to its own entity. */
const findFileLink = async (reg: Pick<Registry, 'prisma'>, linkId: string): Promise<Result<FileLink>> => {
  const link = await reg.prisma.link.findUnique({ where: { id: linkId } });
  if (!link) return err(new Error('Link not found'));
  const key = fileLinkKey(link.url);
  const folder = entityFileFolder(link.entityType, link.entityId);
  if (!key || !folder || !key.startsWith(`${folder}/`)) return err(new Error('Only a file uploaded as a link can be read by Claude here.'));
  return ok({ id: link.id, entityType: link.entityType, entityId: link.entityId, text: link.text ?? null, key });
};

const saveText = async (reg: Pick<Registry, 'prisma'>, linkId: string, text: string): Promise<Result<unknown>> => {
  // The link may have been removed while Claude read it.
  const saved = await reg.prisma.link.updateMany({ where: { id: linkId }, data: { text } });
  return ok(saved.count);
};

const isTextFile = (key: string): boolean => !/\.(pdf|png|jpe?g|gif|webp)$/i.test(key);

/**
 * Starts saving the file link's text in the background ("Re-read"; poll `getFileLinkConversion`
 * with LINK). A text file needs no Claude: its own text is saved at once.
 */
export const transcribeFileLink = async (
  reg: ConvertReg,
  converter: PdfConverter | undefined,
  notebookId: string,
  linkId: string
): Promise<Result<ConvertPdfResult>> => {
  const link = await findFileLink(reg, linkId);
  if (!link.ok) return err(link.error);
  const writable = await ensureWritable(reg, link.value.entityType, link.value.entityId);
  if (!writable.ok) return err(writable.error);
  if (isTextFile(link.value.key)) {
    const file = await reg.storage.readObject(link.value.key);
    if (!file) return err(new Error("The link's file is missing from this notebook's files folder."));
    await saveText(reg, linkId, new TextDecoder('utf-8').decode(file.bytes));
    return ok({ started: true });
  }
  const claudePath = converter?.locate() ?? null;
  if (!converter || !claudePath) return ok({ started: false, warning: CLAUDE_NOT_FOUND_WARNING });
  const path = reg.storage.pathFor(link.value.key);
  if (!path) return err(new Error("The file isn't in this notebook's files folder."));
  converter.start({
    key: fileJobKey(notebookId, 'LINK', linkId),
    claudePath,
    pdfPath: path,
    onMarkdown: (markdown) => saveText(reg, linkId, markdown)
  });
  return ok({ started: true });
};

/**
 * Writes the link's doc or page from its file: from a PDF's or image's saved text when the link
 * has it (no Claude needed), else with Claude in the background, saving that text as well. Poll
 * `getFileLinkConversion`.
 */
export const convertFileLink = async (
  reg: ConvertReg,
  converter: PdfConverter | undefined,
  notebookId: string,
  linkId: string
): Promise<Result<ConvertPdfResult>> => {
  const found = await findFileLink(reg, linkId);
  if (!found.ok) return err(found.error);
  const link = found.value;
  // Only a doc or a document page has text to write; a person's or project's files are kept as they are.
  if (link.entityType !== 'DOC' && link.entityType !== 'PAGE') return err(new Error('Only a doc or a wiki page can be written from a file.'));
  if (link.entityType === 'PAGE') {
    const page = await reg.prisma.page.findUnique({ where: { id: link.entityId }, select: { bodyType: true } });
    if (page?.bodyType === 'sheet') return err(new Error("A spreadsheet page can't be written from a file."));
  }
  const writable = await ensureWritable(reg, link.entityType, link.entityId);
  if (!writable.ok) return err(writable.error);

  const { entityType, entityId } = link;
  const write = (markdown: string): Promise<Result<unknown>> =>
    entityType === 'DOC' ? updateDoc(reg, entityId, { content: markdown }) : updatePage(reg, entityId, { content: markdown });
  // A PDF's or image's saved text is already markdown Claude wrote; a text file's is the file as it is
  // (a CSV), which still needs Claude to become a page, and keeps its own text.
  const textFile = isTextFile(link.key);
  if (link.text !== null && !textFile) {
    const written = await write(link.text);
    return written.ok ? ok({ started: true }) : err(written.error);
  }

  const claudePath = converter?.locate() ?? null;
  if (!converter || !claudePath) return ok({ started: false, warning: CLAUDE_NOT_FOUND_WARNING });
  const path = reg.storage.pathFor(link.key);
  if (!path) return err(new Error("The file isn't in this notebook's files folder."));
  converter.start({
    key: fileJobKey(notebookId, entityType, entityId),
    claudePath,
    pdfPath: path,
    onMarkdown: async (markdown) => {
      if (!textFile) await saveText(reg, linkId, markdown);
      return write(markdown);
    }
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
