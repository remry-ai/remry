// Excalidraw share links for drawing pages and drawing docs: making one (an
// encrypted copy on excalidraw.com, opened from the link) and filling a drawing
// page or doc from one.
// The requests go through an ExcalidrawBackend, so tests never reach the
// network; the format is $shared/drawing/excalidraw-link.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils/result';
import { docPath, entityPath } from '$shared/utils/entity';
import type { EntityType } from '$shared/types/enums';
import { addDoc, updateDoc } from '$api/attached/doc/operations';
import { countImages, isEmptyDrawing, isSkeleton, parseDrawingContent, readDrawingContent, toExcalidrawFile } from '$shared/utils/drawing';
import { decryptScene, encryptScene, parseShareLink, shareLinkProblem, shareLinkUrl } from '$shared/drawing/excalidraw-link';
import type { ExcalidrawBackend } from '$shared/drawing/excalidraw-backend.server';
import { createPage, updatePage } from '$api/page/operations';
import { isEmptyBody } from '$api/_body';

type Reg = Pick<Registry, 'prisma' | 'storage' | 'uuid' | 'logger' | 'now'>;

/** A drawing page or a drawing doc, by id: one of the two. */
export interface DrawingRef {
  readonly pageId?: string;
  readonly docId?: string;
}

interface FoundDrawing {
  readonly title: string;
  readonly content: string;
  readonly path: string;
}

const findDrawing = async (reg: Pick<Registry, 'prisma'>, ref: DrawingRef): Promise<Result<FoundDrawing>> => {
  if (ref.docId) {
    const doc = await reg.prisma.doc.findUnique({ where: { id: ref.docId }, select: { title: true, bodyType: true, content: true, entityType: true, entityId: true } });
    if (!doc) return err(new Error(`Doc ${ref.docId} not found. Find its id with doc.list.`));
    if (doc.bodyType !== 'drawing') return err(new Error(`"${doc.title}" isn't a drawing doc.`));
    return ok({ ...doc, path: docPath(doc.entityType as EntityType, doc.entityId, ref.docId) });
  }
  if (!ref.pageId) return err(new Error('Say which drawing: pageId for a drawing page, or docId for a drawing doc.'));
  const page = await reg.prisma.page.findUnique({ where: { id: ref.pageId }, select: { title: true, bodyType: true, content: true } });
  if (!page) return err(new Error(`Page ${ref.pageId} not found. Find its id with page.list.`));
  if (page.bodyType !== 'drawing') return err(new Error(`"${page.title}" isn't a drawing page.`));
  return ok({ ...page, path: entityPath('PAGE', ref.pageId) });
};

export interface SharedDrawing {
  /** https://excalidraw.com/#json=<id>,<key>: anyone with it can open the drawing. */
  readonly url: string;
}

/**
 * Uploads an encrypted copy of a drawing page to excalidraw.com and returns its
 * share link. The copy is a snapshot: later edits don't reach it, and it can't
 * be taken down from here. A skeleton nobody has opened has no layout yet, so
 * it's refused until the app has laid it out.
 */
export const shareDrawing = async (reg: Pick<Registry, 'prisma'>, backend: ExcalidrawBackend, ref: DrawingRef | string): Promise<Result<SharedDrawing>> => {
  const page = await findDrawing(reg, typeof ref === 'string' ? { pageId: ref } : ref);
  if (!page.ok) return err(page.error);
  const drawing = readDrawingContent(page.value.content);
  if (isEmptyDrawing(drawing)) return err(new Error(`"${page.value.title}" is empty, so there's nothing to share.`));
  if (isSkeleton(drawing)) {
    return err(new Error(`"${page.value.title}" hasn't been opened in the app yet, so it has no layout to share. Open it once in Remry (it's laid out and saved then), and share it after.`));
  }
  const { payload, key } = await encryptScene(toExcalidrawFile(drawing));
  const stored = await backend.post(payload);
  if (!stored.ok) return err(stored.error);
  return ok({ url: shareLinkUrl({ id: stored.value, key }) });
};

export interface ImportShareLinkInput {
  readonly url: string;
  /** Fill this drawing page (it must be empty, unless `replace`). */
  readonly pageId?: string;
  /** Or this drawing doc. */
  readonly docId?: string;
  /** Or make a new drawing page with this title… */
  readonly title?: string;
  /** …under this page… */
  readonly parentId?: string;
  /** …or, with these, a new drawing doc on this entity. */
  readonly entityType?: EntityType;
  readonly entityId?: string;
  /** Replace a drawing that isn't empty. */
  readonly replace?: boolean;
}

export interface ImportedDrawing {
  readonly id: string;
  readonly path: string;
  readonly elements: number;
  /** Pictures in the shared drawing, which Remry's drawings don't keep. */
  readonly imagesLeftOut: number;
}

/** Fills a drawing page, or makes one, from an excalidraw.com share link. */
export const importShareLink = async (reg: Reg, backend: ExcalidrawBackend, input: ImportShareLinkInput): Promise<Result<ImportedDrawing>> => {
  const link = parseShareLink(input.url);
  if (!link) return err(new Error(`${shareLinkProblem(input.url)}.`));

  // Everything that could refuse is checked before the request.
  const existing = input.pageId || input.docId ? { pageId: input.pageId, docId: input.docId } : null;
  if (existing) {
    const found = await findDrawing(reg, existing);
    if (!found.ok) return err(found.error);
    if (!input.replace && !isEmptyBody('drawing', found.value.content)) {
      return err(new Error(`"${found.value.title}" already has a drawing. Pass replace: true to replace it, or import into a new one (a title instead).`));
    }
  } else if (!input.title?.trim()) {
    return err(new Error('Say where the drawing goes: a title for a new drawing page (or doc, with entityType and entityId), or pageId or docId for an empty drawing.'));
  } else if ((input.entityType === undefined) !== (input.entityId === undefined)) {
    return err(new Error('For a new drawing doc, give both entityType and entityId (what it goes on).'));
  }

  const bytes = await backend.get(link.id);
  if (!bytes.ok) return err(bytes.error);
  let scene: unknown;
  try {
    scene = JSON.parse(await decryptScene(bytes.value, link.key));
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
  const drawing = parseDrawingContent(scene);
  if (!drawing.ok) return err(new Error(`The shared drawing couldn't be read: ${drawing.error.message}`));
  const content = JSON.stringify(drawing.value);
  const elements = isSkeleton(drawing.value) ? drawing.value.skeleton.length : drawing.value.elements.length;
  const imagesLeftOut = countImages(scene);

  if (input.docId) {
    const saved = await updateDoc(reg, input.docId, { content });
    if (!saved.ok) return err(saved.error);
    const found = await findDrawing(reg, { docId: input.docId });
    return ok({ id: input.docId, path: found.ok ? found.value.path : '', elements, imagesLeftOut });
  }
  if (input.pageId) {
    const saved = await updatePage(reg, input.pageId, { content });
    if (!saved.ok) return err(saved.error);
    return ok({ id: input.pageId, path: entityPath('PAGE', input.pageId), elements, imagesLeftOut });
  }
  if (input.entityType && input.entityId) {
    const added = await addDoc(reg, input.entityType, input.entityId, { title: input.title!.trim(), bodyType: 'drawing' });
    if (!added.ok) return err(added.error);
    const saved = await updateDoc(reg, added.value.id, { content });
    if (!saved.ok) return err(saved.error);
    return ok({ id: added.value.id, path: docPath(input.entityType, input.entityId, added.value.id), elements, imagesLeftOut });
  }
  const created = await createPage(reg, { title: input.title!.trim(), bodyType: 'drawing', parentId: input.parentId, content });
  if (!created.ok) return err(created.error);
  return ok({ ...created.value, elements, imagesLeftOut });
};
