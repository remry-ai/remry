import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable } from '$api/_archive';
import type { EntityType } from '$shared/types/enums';
import { fileUrl } from '$shared/utils/files';
import { acceptsDocs, entityPath } from '$shared/utils/entity';
import { resolveEntityLabel } from '$api/_entity-labels';
import { relationCleanupOp } from '$api/_entity-cleanup';
import { syncMentions } from '$api/relation/mentions';

// ----- Types -----

export interface DocSummary {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly sourceUrl: string | null;
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

export const addDoc = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string,
  input: { readonly title: string }
): Promise<Result<{ readonly id: string }>> => {
  if (!acceptsDocs(entityType)) {
    return err(new Error("Wiki pages don't take docs. Write it into the page's content with page.update, or add a sub-page with page.create --parentId <pageId>."));
  }
  const writable = await ensureWritable(reg, entityType, entityId);
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
  reg: Pick<Registry, 'prisma'>,
  id: string,
  input: { readonly title?: string; readonly content?: string; readonly sourceUrl?: string | null }
): Promise<Result<{ readonly id: string }>> => {
  const existing = await reg.prisma.doc.findUnique({ where: { id } });
  if (!existing) return err(new Error('Doc not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  await reg.prisma.doc.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.sourceUrl !== undefined && { sourceUrl: input.sourceUrl })
    }
  });
  if (input.content !== undefined) await syncMentions(reg, { entityType: 'DOC', entityId: id }, input.content);
  return ok({ id });
};

export const removeDoc = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.doc.findUnique({ where: { id } });
  if (!existing) return err(new Error('Doc not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  if (existing.sourceUrl) {
    try {
      await reg.storage.deleteObject(existing.sourceUrl);
    } catch (error) {
      reg.logger.warn({ docId: id, sourceUrl: existing.sourceUrl, error }, 'failed to delete PDF from storage');
    }
  }

  await relationCleanupOp(reg, 'DOC', id);
  await reg.prisma.doc.delete({ where: { id } });
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
export const attachSourcePdf = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'uuid' | 'logger'>,
  docId: string,
  contentType: string,
  dataBase64: string
): Promise<Result<{ readonly sourceUrl: string }>> => {
  const existing = await reg.prisma.doc.findUnique({ where: { id: docId } });
  if (!existing) return err(new Error('Doc not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  const key = `docs/${docId}/source-${reg.uuid()}.pdf`;
  await reg.storage.putObject(key, Buffer.from(dataBase64, 'base64'), contentType);
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

export const DOC_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type DocImageType = (typeof DOC_IMAGE_TYPES)[number];

const IMAGE_EXTENSIONS: Readonly<Record<DocImageType, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

/**
 * Store an image pasted or dropped into a doc. Returns the storage key, which
 * the editor writes into the content as `storage://<key>`.
 */
export const uploadDocImage = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'uuid'>,
  docId: string,
  contentType: DocImageType,
  dataBase64: string
): Promise<Result<{ readonly key: string }>> => {
  const existing = await reg.prisma.doc.findUnique({ where: { id: docId } });
  if (!existing) return err(new Error('Doc not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  const key = `docs/${docId}/image-${reg.uuid()}.${IMAGE_EXTENSIONS[contentType]}`;
  await reg.storage.putObject(key, Buffer.from(dataBase64, 'base64'), contentType);
  return ok({ key });
};

export const getDocReadUrl = async (
  reg: Pick<Registry, 'prisma'>,
  id: string
): Promise<Result<{ readonly url: string }>> => {
  const doc = await reg.prisma.doc.findUnique({ where: { id } });
  if (!doc || !doc.sourceUrl) return err(new Error('Doc not found'));
  return ok({ url: fileUrl(doc.sourceUrl) });
};
