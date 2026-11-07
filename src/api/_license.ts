// Cross-domain helper (not a domain): Remry Pro. A Pro procedure runs only
// while this computer has an active license, and otherwise returns an error that
// says what to do, for the app's user or for Claude through a tool. Drawings are
// free up to FREE_DRAWINGS a notebook; only making another past that is locked.

import type { Context } from '$shared/trpc/context.server';
import type { Registry } from '$shared/registry';
import type { BodyType } from '$shared/types/body-types';
import { canAddDrawing, drawingLimitMessage, isProActive, lockedMessage, type ProFeature } from '$shared/types/license';
import { err, type Result } from '$shared/utils/result';

export const gated = async <T>(
  ctx: Pick<Context, 'license'>,
  feature: ProFeature,
  run: () => Promise<Result<T>>
): Promise<Result<T>> => {
  const status = await ctx.license();
  if (!isProActive(status)) return err(new Error(lockedMessage(feature, status)));
  return run();
};

/** Drawing docs and pages in the notebook, archived ones and docs on archived entities included. */
export const countDrawings = async (reg: Pick<Registry, 'prisma'>): Promise<number> => {
  const [docs, pages] = await Promise.all([
    reg.prisma.doc.count({ where: { bodyType: 'drawing' } }),
    reg.prisma.page.count({ where: { bodyType: 'drawing' } })
  ]);
  return docs + pages;
};


/**
 * Runs `run` unless it would make a new drawing past the free ones without a license. `makes`
 * says whether this call makes one (a drawing doc or page, or a body turned into a drawing);
 * a call that doesn't, such as saving a drawing that already exists, always runs.
 */
export const drawingGated = async <T>(
  ctx: Pick<Context, 'license'>,
  reg: Pick<Registry, 'prisma'>,
  makes: boolean,
  run: () => Promise<Result<T>>
): Promise<Result<T>> => {
  if (!makes) return run();
  const status = await ctx.license();
  if (isProActive(status)) return run();
  const used = await countDrawings(reg);
  return canAddDrawing(used, status) ? run() : err(new Error(drawingLimitMessage(used, status)));
};

/** Whether setting `bodyType` on this doc or page turns it into a drawing (it isn't one yet). */
export const becomesDrawing = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: 'DOC' | 'PAGE',
  id: string,
  bodyType: BodyType | undefined
): Promise<boolean> => {
  if (bodyType !== 'drawing') return false;
  const row = entityType === 'DOC'
    ? await reg.prisma.doc.findUnique({ where: { id }, select: { bodyType: true } })
    : await reg.prisma.page.findUnique({ where: { id }, select: { bodyType: true } });
  // A missing row makes nothing; the operation says it's not found.
  return row !== null && row.bodyType !== 'drawing';
};

