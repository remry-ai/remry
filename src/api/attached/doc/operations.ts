import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureAttachable, ensureWritable, loadArchivedIds, notAttachedToArchived } from '$api/_archive';
import type { EntityType } from '$shared/types/enums';
import { fileUrl } from '$shared/utils/files';
import { acceptsDocs, docPath, entityPath } from '$shared/utils/entity';
import { resolveEntityLabel, resolveEntityLabels } from '$api/_entity-labels';
import { planEntityCleanup, removeFiles } from '$api/_entity-cleanup';
import { EDITOR_IMAGE_TYPES, refuseBlobUrls, storeEditorImage, tidyEditorImages, type EditorImageType, type StoredImage } from '$api/_images';
import { syncMentions } from '$api/relation/mentions';
import { decodeUpload } from '$api/_uploads';

// ----- Types -----

export interface DocSummary {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly sourceUrl: string | null;
  /** A sync doc's prompt: what to pull from its linked sources. Null for an ordinary doc. */
  readonly prompt: string | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DocDetail extends DocSummary {
  readonly entityType: EntityType;
  readonly entityId: string;
  /** Name or title of the entity the doc is attached to; null if it's gone. */
  readonly entityName: string | null;
  readonly entityPath: string;
}

// ----- Operations -----

export const getDoc = async (
  reg: Pick<Registry, 'prisma'>,
  id: string
): Promise<Result<DocDetail>> => {
  const doc = await reg.prisma.doc.findUnique({ where: { id } });
  if (!doc) return err(new Error('Doc not found'));
  const entityType = doc.entityType as EntityType;
  return ok({
    id: doc.id,
    title: doc.title,
    content: doc.content,
    sourceUrl: doc.sourceUrl,
    prompt: doc.prompt,
    sortOrder: doc.sortOrder,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    entityType,
    entityId: doc.entityId,
    entityName: await resolveEntityLabel(reg, entityType, doc.entityId),
    entityPath: entityPath(entityType, doc.entityId)
  });
};

export const listDocs = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string
): Promise<Result<readonly DocSummary[]>> => {
  const docs = await reg.prisma.doc.findMany({
    where: { entityType, entityId },
    orderBy: { sortOrder: 'asc' }
  });
  return ok(docs);
};

export interface DocTitle {
  readonly id: string;
  readonly title: string;
  /** The entity it's attached to, by name; null if it's gone. */
  readonly entityName: string | null;
  /** Opens the doc on its entity's page. */
  readonly path: string;
}

/** Every doc's title and where it opens, without content: the ⌘K finder's `doc:` list. Docs on archived entities are left out. */
export const listDocTitles = async (reg: Pick<Registry, 'prisma'>): Promise<Result<readonly DocTitle[]>> => {
  const archived = await loadArchivedIds(reg);
  const docs = await reg.prisma.doc.findMany({
    where: notAttachedToArchived(archived),
    select: { id: true, title: true, entityType: true, entityId: true },
    orderBy: { updatedAt: 'desc' }
  });
  const labels = await resolveEntityLabels(reg, docs.map((d) => ({ entityType: d.entityType as EntityType, entityId: d.entityId })));
  return ok(docs.map((d) => ({
    id: d.id,
    title: d.title,
    entityName: labels.labelOf(d.entityType as EntityType, d.entityId),
    path: docPath(d.entityType as EntityType, d.entityId, d.id)
  })));
};

export const addDoc = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string,
  input: { readonly title: string }
): Promise<Result<{ readonly id: string }>> => {
  if (!acceptsDocs(entityType)) {
    return err(new Error("Wiki pages don't take docs. Write it into the page's content with page.update, or add a sub-page with page.create --parentId <pageId>."));
  }
  const writable = await ensureAttachable(reg, entityType, entityId);
  if (!writable.ok) return err(writable.error);
  const maxOrder = await reg.prisma.doc.aggregate({
    where: { entityType, entityId },
    _max: { sortOrder: true }
  });
  const doc = await reg.prisma.doc.create({
    data: {
      entityType,
      entityId,
      title: input.title,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1
    }
  });
  return ok({ id: doc.id });
};

export const updateDoc = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger' | 'now'>,
  id: string,
  input: { readonly title?: string; readonly content?: string; readonly sourceUrl?: string | null; readonly prompt?: string | null }
): Promise<Result<{ readonly id: string }>> => {
  const existing = await reg.prisma.doc.findUnique({ where: { id } });
  if (!existing) return err(new Error('Doc not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);
  if (input.content !== undefined) {
    const images = refuseBlobUrls(input.content);
    if (!images.ok) return err(images.error);
  }

  await reg.prisma.doc.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.sourceUrl !== undefined && { sourceUrl: input.sourceUrl }),
      ...(input.prompt !== undefined && { prompt: input.prompt?.trim() || null })
    }
  });
  if (input.content !== undefined) {
    await syncMentions(reg, { entityType: 'DOC', entityId: id }, input.content);
    await tidyEditorImages(reg, `docs/${id}`, input.content);
  }
  return ok({ id });
};

/** Also deletes what's attached to the doc, its relations, and its PDF once the rows are gone. */
export const removeDoc = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.doc.findUnique({ where: { id } });
  if (!existing) return err(new Error('Doc not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  const cleanup = await planEntityCleanup(reg, 'DOC', id);
  await reg.prisma.$transaction([...cleanup.ops, reg.prisma.doc.delete({ where: { id } })]);
  await removeFiles(reg, { ...cleanup, files: existing.sourceUrl ? [existing.sourceUrl, ...cleanup.files] : cleanup.files });
  return ok({ deleted: true as const });
};

export const reorderDocs = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string,
  docIds: readonly string[]
): Promise<Result<{ readonly reordered: true }>> => {
  const writable = await ensureWritable(reg, entityType, entityId);
  if (!writable.ok) return err(writable.error);
  await reg.prisma.$transaction(
    docIds.map((id, i) =>
      reg.prisma.doc.update({ where: { id }, data: { sortOrder: i } })
    )
  );
  return ok({ reordered: true as const });
};

/**
 * Store a PDF as the doc's source file. This doesn't convert it: from the CLI
 * or MCP, Claude reads the PDF and calls `doc.update`; the web app can run the
 * local Claude Code CLI through `doc.convertPdf` (convert.ts).
 */
/** Attaches a doc's source PDF, checked by its bytes (`decodeUpload`), replacing any before it. */
export const attachSourcePdf = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'uuid' | 'logger'>,
  docId: string,
  dataBase64: string
): Promise<Result<{ readonly sourceUrl: string }>> => {
  const existing = await reg.prisma.doc.findUnique({ where: { id: docId } });
  if (!existing) return err(new Error('Doc not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);
  const pdf = decodeUpload(dataBase64, ['application/pdf'], 'a PDF');
  if (!pdf.ok) return err(pdf.error);

  const key = `docs/${docId}/source-${reg.uuid()}.pdf`;
  await reg.storage.putObject(key, pdf.value.bytes, pdf.value.contentType);
  await reg.prisma.doc.update({ where: { id: docId }, data: { sourceUrl: key } });

  if (existing.sourceUrl) {
    try {
      await reg.storage.deleteObject(existing.sourceUrl);
    } catch (error) {
      reg.logger.warn({ docId, sourceUrl: existing.sourceUrl, error }, 'failed to delete previous PDF');
    }
  }

  return ok({ sourceUrl: key });
};

export const DOC_IMAGE_TYPES = EDITOR_IMAGE_TYPES;
export type DocImageType = EditorImageType;

export const uploadDocImage = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'uuid'>,
  docId: string,
  dataBase64: string
): Promise<Result<StoredImage>> => {
  const existing = await reg.prisma.doc.findUnique({ where: { id: docId } });
  if (!existing) return err(new Error('Doc not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  return storeEditorImage(reg, `docs/${docId}`, dataBase64);
};

export const getDocReadUrl = async (
  reg: Pick<Registry, 'prisma'>,
  id: string
): Promise<Result<{ readonly url: string }>> => {
  const doc = await reg.prisma.doc.findUnique({ where: { id } });
  if (!doc || !doc.sourceUrl) return err(new Error('Doc not found'));
  return ok({ url: fileUrl(doc.sourceUrl) });
};
