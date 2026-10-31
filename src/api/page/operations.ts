import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import type { ArchiveFilter } from '$shared/types/enums';
import { validateChartBlocks } from '$shared/types/charts';
import type { PageBodyType, PageDetail, PageSummary } from '$shared/types/pages';
import { entityPath } from '$shared/utils/entity';
import { parseSheetContent, readSheetContent } from '$shared/utils/sheet';
import { wouldCreateCycle } from '$shared/utils/hierarchy';
import { planEntityCleanup, removeFiles } from '$api/_entity-cleanup';
import { archiveWhere, ensureWritable, ACTIVE } from '$api/_archive';
import { syncMentions } from '$api/relation/mentions';
import { adoptForeignImages, refuseBlobUrls, storeEditorImage, tidyEditorImages, type StoredImage } from '$api/_images';
import { decodeSourceFile } from '$api/_uploads';

// ----- Pure helpers -----

/**
 * Checks a body before it's stored and returns what to store: markdown as
 * given (its chart blocks valid), or a sheet's JSON normalised (values filled
 * in, rows padded) so search and print can rely on its shape.
 */
export const prepareContent = (bodyType: PageBodyType, content: string): Result<string> => {
  if (bodyType === 'doc') {
    const images = refuseBlobUrls(content);
    if (!images.ok) return err(images.error);
    const charts = validateChartBlocks(content);
    return charts.ok ? ok(content) : err(charts.error);
  }
  const sheet = parseSheetContent(content);
  return sheet.ok ? ok(JSON.stringify(sheet.value)) : err(sheet.error);
};

/** A document with no text, or a sheet with no filled cells. */
export const isEmptyBody = (bodyType: PageBodyType, content: string): boolean =>
  bodyType === 'doc' ? content.trim() === '' : readSheetContent(content).data.every((row) => row.every((cell) => cell.trim() === ''));

const asBodyType = (value: string): PageBodyType => (value === 'sheet' ? 'sheet' : 'doc');

// ----- Row mapping -----

const ORDER = [{ sortOrder: 'asc' as const }, { title: 'asc' as const }];

const SUMMARY_FIELDS = { id: true, title: true, bodyType: true, parentId: true, archivedAt: true, updatedAt: true } as const;

interface PageRow {
  readonly id: string;
  readonly title: string;
  readonly bodyType: string;
  readonly parentId: string | null;
  readonly archivedAt: Date | null;
  readonly updatedAt: Date;
}

const toSummary = (row: PageRow): PageSummary => ({
  id: row.id,
  title: row.title,
  bodyType: asBodyType(row.bodyType),
  parentId: row.parentId,
  path: entityPath('PAGE', row.id),
  archivedAt: row.archivedAt,
  updatedAt: row.updatedAt
});

const checkParent = async (
  reg: Pick<Registry, 'prisma'>,
  id: string | null,
  parentId: string
): Promise<Result<void>> => {
  const parent = await reg.prisma.page.findUnique({ where: { id: parentId }, select: { title: true } });
  if (!parent) return err(new Error(`Parent page ${parentId} not found`));
  if (id === null) return ok(undefined);

  const all = await reg.prisma.page.findMany({ select: { id: true, parentId: true } });
  const parents = new Map(all.map((p) => [p.id, p.parentId]));
  return wouldCreateCycle((pageId) => parents.get(pageId), id, parentId)
    ? err(new Error(`"${parent.title}" is this page or one of its sub-pages, so it can't be its parent`))
    : ok(undefined);
};

// ----- Queries -----

export interface PageFilters {
  /** null lists top-level pages. */
  readonly parentId?: string | null;
  readonly archived?: ArchiveFilter;
}

export const listPages = async (
  reg: Pick<Registry, 'prisma'>,
  filters: PageFilters
): Promise<Result<readonly PageSummary[]>> => {
  const rows = await reg.prisma.page.findMany({
    where: {
      ...archiveWhere(filters.archived),
      ...(filters.parentId !== undefined && { parentId: filters.parentId })
    },
    orderBy: ORDER,
    select: SUMMARY_FIELDS
  });
  return ok(rows.map(toSummary));
};

export const getPage = async (
  reg: Pick<Registry, 'prisma' | 'storage'>,
  id: string
): Promise<Result<PageDetail>> => {
  const row = await reg.prisma.page.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, title: true } },
      children: { where: ACTIVE, orderBy: ORDER, select: { id: true, title: true } }
    }
  });
  if (!row) return err(new Error(`Page ${id} not found`));

  return ok({
    ...toSummary(row),
    content: row.content,
    prompt: row.prompt,
    sourceUrl: await pageSourceKey(reg, id),
    parent: row.parent,
    children: row.children.map((child) => ({
      id: child.id,
      title: child.title,
      path: entityPath('PAGE', child.id)
    })),
    createdAt: row.createdAt
  });
};

// ----- Mutations -----

export interface CreatePageInput {
  readonly title: string;
  /** Default doc. */
  readonly bodyType?: PageBodyType;
  readonly parentId?: string;
  readonly content?: string;
}

export const createPage = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'uuid' | 'logger'>,
  input: CreatePageInput
): Promise<Result<{ readonly id: string; readonly path: string }>> => {
  const bodyType = input.bodyType ?? 'doc';
  const content = prepareContent(bodyType, input.content ?? '');
  if (!content.ok) return err(content.error);

  if (input.parentId) {
    const parent = await checkParent(reg, null, input.parentId);
    if (!parent.ok) return err(parent.error);
  }

  const row = await reg.prisma.page.create({
    data: {
      title: input.title,
      bodyType,
      parentId: input.parentId,
      content: content.value
    }
  });
  if (bodyType === 'doc' && content.value) {
    // Text from a doc (a doc turned into a page) keeps its images: they're copied here.
    const adopted = await adoptForeignImages(reg, `pages/${row.id}`, content.value);
    if (adopted !== content.value) await reg.prisma.page.update({ where: { id: row.id }, data: { content: adopted } });
    await syncMentions(reg, { entityType: 'PAGE', entityId: row.id }, adopted);
  }
  return ok({ id: row.id, path: entityPath('PAGE', row.id) });
};

export interface UpdatePageInput {
  readonly title?: string;
  /** Only while the page has no content, so a body is never converted by accident. */
  readonly bodyType?: PageBodyType;
  readonly parentId?: string | null;
  readonly content?: string;
  /** Makes it a sync doc, rewritten from its linked sources; null (or blank) clears it. */
  readonly prompt?: string | null;
}

export const updatePage = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger' | 'now' | 'uuid'>,
  id: string,
  input: UpdatePageInput
): Promise<Result<{ readonly id: string }>> => {
  const existing = await reg.prisma.page.findUnique({ where: { id }, select: { bodyType: true, content: true } });
  if (!existing) return err(new Error(`Page ${id} not found`));
  const writable = await ensureWritable(reg, 'PAGE', id);
  if (!writable.ok) return err(writable.error);

  const currentType = asBodyType(existing.bodyType);
  const bodyType = input.bodyType ?? currentType;
  if (bodyType !== currentType && !isEmptyBody(currentType, existing.content)) {
    const was = currentType === 'doc' ? 'a document' : 'a spreadsheet';
    return err(new Error(`This page already has content as ${was}, so it can't become a ${bodyType === 'doc' ? 'document' : 'spreadsheet'}. Clear its content first, or create a new page.`));
  }
  let content: string | undefined;
  if (input.content !== undefined || bodyType !== currentType) {
    const prepared = prepareContent(bodyType, input.content ?? '');
    if (!prepared.ok) return err(prepared.error);
    // Images shown from another doc's or page's folder get a copy here, so deleting that one can't lose them.
    content = bodyType === 'doc' ? await adoptForeignImages(reg, `pages/${id}`, prepared.value) : prepared.value;
  }

  if (input.parentId) {
    const parent = await checkParent(reg, id, input.parentId);
    if (!parent.ok) return err(parent.error);
  }

  await reg.prisma.page.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.parentId !== undefined && { parentId: input.parentId }),
      ...(bodyType !== currentType && { bodyType }),
      ...(content !== undefined && { content }),
      ...(input.prompt !== undefined && { prompt: input.prompt?.trim() || null })
    }
  });
  // A sheet links nothing and shows no images, so switching to one clears the page's mentions.
  if (content !== undefined) {
    await syncMentions(reg, { entityType: 'PAGE', entityId: id }, bodyType === 'doc' ? content : '');
    await tidyEditorImages(reg, `pages/${id}`, bodyType === 'doc' ? content : '');
  }
  return ok({ id });
};

/** Sub-pages move up to this page's parent; attached items and relations are deleted. */
export const deletePage = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger' | 'now'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.page.findUnique({ where: { id }, select: { parentId: true } });
  if (!existing) return err(new Error(`Page ${id} not found`));

  const cleanup = await planEntityCleanup(reg, 'PAGE', id);
  await reg.prisma.$transaction([
    reg.prisma.page.updateMany({ where: { parentId: id }, data: { parentId: existing.parentId } }),
    ...cleanup.ops,
    reg.prisma.page.delete({ where: { id } })
  ]);
  await removeFiles(reg, cleanup);
  return ok({ deleted: true as const });
};

/**
 * Stores an image pasted or dropped into a page's content editor. Returns the storage
 * key, which the editor writes into the content as `storage://<key>`.
 */
export const uploadPageImage = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'uuid'>,
  pageId: string,
  dataBase64: string
): Promise<Result<StoredImage>> => {
  const existing = await reg.prisma.page.findUnique({ where: { id: pageId }, select: { id: true } });
  if (!existing) return err(new Error(`Page ${pageId} not found`));
  const writable = await ensureWritable(reg, 'PAGE', pageId);
  if (!writable.ok) return err(writable.error);
  return storeEditorImage(reg, `pages/${pageId}`, dataBase64);
};

const SOURCE_PREFIX = 'source-';

/**
 * The page's source file, found in its folder like its images (`pages/<id>/source-<uuid>.<ext>`;
 * nothing in the database), or null. The newest, should there ever be more than one.
 */
export const pageSourceKey = async (reg: Pick<Registry, 'storage'>, pageId: string): Promise<string | null> => {
  const files = (await reg.storage.listFolder(`pages/${pageId}`)).filter((f) => f.name.startsWith(SOURCE_PREFIX));
  const newest = [...files].sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())[0];
  return newest ? `pages/${pageId}/${newest.name}` : null;
};

/**
 * Attaches a page's source file, as `doc.attachSource` does for a doc: any file Claude can read
 * (`decodeSourceFile`: a PDF, an image or text), stored in the page's folder beside its images,
 * replacing any before it. The folder goes when the page does (`planEntityCleanup`).
 */
export const attachPageSource = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'uuid' | 'logger'>,
  pageId: string,
  dataBase64: string,
  fileName?: string
): Promise<Result<{ readonly sourceUrl: string }>> => {
  const existing = await reg.prisma.page.findUnique({ where: { id: pageId }, select: { id: true } });
  if (!existing) return err(new Error(`Page ${pageId} not found`));
  const writable = await ensureWritable(reg, 'PAGE', pageId);
  if (!writable.ok) return err(writable.error);
  const file = decodeSourceFile(dataBase64, fileName);
  if (!file.ok) return err(file.error);

  const previous = await pageSourceKey(reg, pageId);
  const key = `pages/${pageId}/${SOURCE_PREFIX}${reg.uuid()}.${file.value.extension}`;
  await reg.storage.putObject(key, file.value.bytes, file.value.contentType);

  if (previous) {
    try {
      await reg.storage.deleteObject(previous);
    } catch (error) {
      reg.logger.warn({ pageId, sourceUrl: previous, error }, 'failed to delete the previous source file');
    }
  }
  return ok({ sourceUrl: key });
};
