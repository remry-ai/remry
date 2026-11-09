import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import type { ArchiveFilter } from '$shared/types/enums';
import type { PageBodyType, PageDetail, PageSummary } from '$shared/types/pages';
import { entityPath } from '$shared/utils/entity';
import { readLastSync } from '$shared/utils/sync-state';
import { asBodyType } from '$shared/types/body-types';
import { linkedText, planBodyUpdate, prepareContent } from '$api/_body';
import { wouldCreateCycle } from '$shared/utils/hierarchy';
import { planEntitiesCleanup, removeFiles, subtreeIds } from '$api/_entity-cleanup';
import { archiveWhere, ensureWritable, ACTIVE } from '$api/_archive';
import { syncMentions } from '$api/relation/mentions';
import { adoptForeignImages, storeEditorImage, tidyEditorImages, type StoredImage } from '$api/_images';

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
  reg: Pick<Registry, 'prisma'>,
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
    lastSync: readLastSync(row),
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
  if (linkedText(bodyType, content.value)) {
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
  const existing = await reg.prisma.page.findUnique({ where: { id }, select: { bodyType: true, content: true, prompt: true } });
  if (!existing) return err(new Error(`Page ${id} not found`));
  const writable = await ensureWritable(reg, 'PAGE', id);
  if (!writable.ok) return err(writable.error);

  const body = planBodyUpdate('page', existing, input);
  if (!body.ok) return err(body.error);
  const { bodyType, typeChanged } = body.value;
  // Images shown from another doc's or page's folder get a copy here, so deleting that one can't lose them.
  const content = body.value.content === undefined || bodyType !== 'doc' ? body.value.content : await adoptForeignImages(reg, `pages/${id}`, body.value.content);

  if (input.parentId) {
    const parent = await checkParent(reg, id, input.parentId);
    if (!parent.ok) return err(parent.error);
  }

  await reg.prisma.page.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.parentId !== undefined && { parentId: input.parentId }),
      ...(typeChanged && { bodyType }),
      ...(content !== undefined && { content }),
      ...(input.prompt !== undefined && { prompt: input.prompt?.trim() || null })
    }
  });
  // A sheet or drawing links nothing and shows no images, so switching to one clears the page's mentions.
  if (content !== undefined) {
    await syncMentions(reg, { entityType: 'PAGE', entityId: id }, linkedText(bodyType, content));
    await tidyEditorImages(reg, `pages/${id}`, linkedText(bodyType, content));
  }
  return ok({ id });
};

/** Deletes the page and its sub-pages at any depth, with what's attached to each and their relations. */
export const deletePage = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger' | 'now'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.page.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return err(new Error(`Page ${id} not found`));

  const ids = await subtreeIds(reg, 'PAGE', id);
  const cleanup = await planEntitiesCleanup(reg, 'PAGE', ids);
  await reg.prisma.$transaction([
    ...cleanup.ops,
    reg.prisma.page.deleteMany({ where: { id: { in: [...ids] } } })
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
