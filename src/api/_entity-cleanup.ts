// Cross-domain helper (not a domain): everything that points at an entity
// about to be deleted. Aux rows, relations and owners have no foreign key, so
// without this they'd be left behind. Run `ops` in the same $transaction as the
// delete, then remove `files` (PDFs of the attached docs) once it commits.

import type { Registry } from '$shared/registry';
import type { EntityType } from '$shared/types/enums';

type BatchWrite = ReturnType<Registry['prisma']['doc']['deleteMany']>;

export interface EntityCleanup {
  readonly ops: readonly BatchWrite[];
  readonly files: readonly string[];
}

export const planEntityCleanup = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string
): Promise<EntityCleanup> => {
  const p = reg.prisma;
  const attached = { where: { entityType, entityId } };
  const owned = { where: { ownerType: entityType, ownerId: entityId }, data: { ownerType: null, ownerId: null } };

  const docsWithFiles = await p.doc.findMany({
    where: { entityType, entityId, sourceUrl: { not: null } },
    select: { sourceUrl: true }
  });

  return {
    ops: [
      p.doc.deleteMany(attached),
      p.note.deleteMany(attached),
      p.report.deleteMany(attached),
      p.todo.deleteMany(attached),
      p.link.deleteMany(attached),
      p.tagAttachment.deleteMany(attached),
      p.comment.deleteMany(attached),
      p.emoji.deleteMany(attached),
      p.pageChat.deleteMany(attached),
      relationCleanupOp(reg, entityType, entityId),
      p.goal.updateMany(owned),
      p.project.updateMany(owned)
    ],
    files: docsWithFiles.flatMap((d) => (d.sourceUrl ? [d.sourceUrl] : []))
  };
};

/** Deletes relations at either end of an entity. */
export const relationCleanupOp = (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string
): BatchWrite =>
  reg.prisma.relation.deleteMany({
    where: { OR: [{ fromType: entityType, fromId: entityId }, { toType: entityType, toId: entityId }] }
  });

/** Best effort: a file that can't be removed is logged, not an error. */
export const removeFiles = async (
  reg: Pick<Registry, 'storage' | 'logger'>,
  keys: readonly string[]
): Promise<void> => {
  for (const key of keys) {
    try {
      await reg.storage.deleteObject(key);
    } catch (error) {
      reg.logger.warn({ key, error }, 'failed to delete a file of a deleted entity');
    }
  }
};
