// Excalidraw share links for drawing pages: making one (an encrypted copy on
// excalidraw.com, opened from the link) and filling a drawing page from one.
// The requests go through an ExcalidrawBackend, so tests never reach the
// network; the format is $shared/drawing/excalidraw-link.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils/result';
import { entityPath } from '$shared/utils/entity';
import { countImages, isEmptyDrawing, isSkeleton, parseDrawingContent, readDrawingContent, toExcalidrawFile } from '$shared/utils/drawing';
import { decryptScene, encryptScene, parseShareLink, shareLinkProblem, shareLinkUrl } from '$shared/drawing/excalidraw-link';
import type { ExcalidrawBackend } from '$shared/drawing/excalidraw-backend.server';
import { createPage, isEmptyBody, updatePage } from '$api/page/operations';

type Reg = Pick<Registry, 'prisma' | 'storage' | 'uuid' | 'logger' | 'now'>;

const findDrawing = async (reg: Pick<Registry, 'prisma'>, id: string): Promise<Result<{ readonly title: string; readonly content: string }>> => {
  const page = await reg.prisma.page.findUnique({ where: { id }, select: { title: true, bodyType: true, content: true } });
  if (!page) return err(new Error(`Page ${id} not found. Find its id with page.list.`));
  if (page.bodyType !== 'drawing') return err(new Error(`"${page.title}" isn't a drawing page.`));
  return ok(page);
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
export const shareDrawing = async (reg: Pick<Registry, 'prisma'>, backend: ExcalidrawBackend, pageId: string): Promise<Result<SharedDrawing>> => {
  const page = await findDrawing(reg, pageId);
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
  /** Or make a new drawing page with this title… */
  readonly title?: string;
  /** …under this page. */
  readonly parentId?: string;
  /** Replace a drawing page's drawing that isn't empty. */
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
  if (input.pageId) {
    const page = await findDrawing(reg, input.pageId);
    if (!page.ok) return err(page.error);
    if (!input.replace && !isEmptyBody('drawing', page.value.content)) {
      return err(new Error(`"${page.value.title}" already has a drawing. Pass replace: true to replace it, or import into a new page (title instead of pageId).`));
    }
  } else if (!input.title?.trim()) {
    return err(new Error('Say where the drawing goes: a title for a new drawing page, or pageId for an empty drawing page.'));
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

  if (input.pageId) {
    const saved = await updatePage(reg, input.pageId, { content });
    if (!saved.ok) return err(saved.error);
    return ok({ id: input.pageId, path: entityPath('PAGE', input.pageId), elements, imagesLeftOut });
  }
  const created = await createPage(reg, { title: input.title!.trim(), bodyType: 'drawing', parentId: input.parentId, content });
  if (!created.ok) return err(created.error);
  return ok({ ...created.value, elements, imagesLeftOut });
};
