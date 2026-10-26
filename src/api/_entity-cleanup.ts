// Cross-domain helper (not a domain): everything that points at an entity
// about to be deleted, and at what's attached to it, at any depth. Attached rows,
// relations and owners have no foreign key, so without this they'd be left behind.
// Run `ops` in the same $transaction as the delete, then remove `files` (PDFs of
// the attached docs) once it commits.

import type { Registry } from '$shared/registry';
import type { EntityType } from '$shared/types/enums';
import { purgeTrash, trashImages } from '$api/_images';

type BatchWrite = ReturnType<Registry['prisma']['doc']['deleteMany']>;

export interface EntityCleanup {
  readonly ops: readonly BatchWrite[];
  /** Files to remove once the transaction commits: the deleted docs' PDFs. */
  readonly files: readonly string[];
  /** Folders to remove with them: each deleted doc's or page's own files (pasted images, PDFs). */
  readonly folders: readonly string[];
}

// The folder each type keeps its own files in, keyed by id (`docs/<id>/image-….png`).
const FILE_FOLDERS: Readonly<Partial<Record<string, string>>> = { DOC: 'docs', PAGE: 'pages' };
const folderOf = (entityType: string, entityId: string): readonly string[] => {
  const folder = FILE_FOLDERS[entityType];
  return folder ? [`${folder}/${entityId}`] : [];
};

// Rows that are attached to an entity and can have attachments of their own.
const ATTACHED_TYPES = ['DOC', 'NOTE', 'REPORT', 'TODO', 'LINK', 'COMMENT'] as const;
type AttachedType = (typeof ATTACHED_TYPES)[number];

interface Ref {
  readonly entityType: string;
  readonly entityId: string;
}

/** Ids per statement: well under SQLite's 32,766 values, however many rows a delete reaches. */
export const CLEANUP_BATCH = 5000;

const inBatches = <T>(items: readonly T[], size = CLEANUP_BATCH): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
};

/** Ids by type, in first-seen order. */
const idsByType = (refs: readonly Ref[]): Map<string, string[]> => {
  const byType = new Map<string, string[]>();
  for (const { entityType, entityId } of refs) {
    const ids = byType.get(entityType);
    if (ids) ids.push(entityId);
    else byType.set(entityType, [entityId]);
  }
  return byType;
};

/** The refs, one batch of at most CLEANUP_BATCH ids of one type at a time (mutable: Prisma's where-input types don't take readonly arrays). */
const refBatches = (refs: readonly Ref[]): { readonly entityType: string; readonly ids: string[] }[] =>
  [...idsByType(refs)].flatMap(([entityType, ids]) => inBatches(ids).map((batch) => ({ entityType, ids: batch })));

/**
 * Everything attached to the roots, at any depth: a note's comments, a todo's
 * tags, a doc's links, replies to a note. Each pass looks for what's attached to
 * the rows the last pass found, until a pass finds nothing new.
 */
const collectAttached = async (
  reg: Pick<Registry, 'prisma'>,
  roots: readonly Ref[]
): Promise<{ readonly ids: Readonly<Record<AttachedType, readonly string[]>>; readonly files: readonly string[] }> => {
  const p = reg.prisma;
  const ids: Record<AttachedType, string[]> = { DOC: [], NOTE: [], REPORT: [], TODO: [], LINK: [], COMMENT: [] };
  const files: string[] = [];
  const seen = new Set(roots.map((r) => `${r.entityType}:${r.entityId}`));
  let frontier: readonly Ref[] = roots;

  while (frontier.length > 0) {
    const select = { id: true } as const;
    // One batch of ids per statement, so a pass that finds tens of thousands stays under SQLite's limit.
    const found = await Promise.all(refBatches(frontier).map(async ({ entityType: type, ids: batch }) => {
      const where = { entityType: type, entityId: { in: batch } };
      return Promise.all([
        p.doc.findMany({ where, select: { id: true, sourceUrl: true } }),
        p.note.findMany({ where, select }),
        p.report.findMany({ where, select }),
        p.todo.findMany({ where, select }),
        p.link.findMany({ where, select }),
        p.comment.findMany({ where, select }),
        type === 'NOTE' ? p.note.findMany({ where: { parentId: { in: batch } }, select }) : Promise.resolve([])
      ]);
    }));
    const [docs, notes, reports, todos, links, comments, replies] = [0, 1, 2, 3, 4, 5, 6].map((i) => found.flatMap((rows) => rows[i]!)) as [
      { id: string; sourceUrl: string | null }[], { id: string }[], { id: string }[], { id: string }[], { id: string }[], { id: string }[], { id: string }[]
    ];

    const next: Ref[] = [];
    const add = (entityType: AttachedType, rows: readonly { readonly id: string }[]): void => {
      for (const { id } of rows) {
        const key = `${entityType}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        ids[entityType].push(id);
        next.push({ entityType, entityId: id });
      }
    };
    add('DOC', docs);
    add('NOTE', [...notes, ...replies]);
    add('REPORT', reports);
    add('TODO', todos);
    add('LINK', links);
    add('COMMENT', comments);
    for (const d of docs) if (d.sourceUrl && !files.includes(d.sourceUrl)) files.push(d.sourceUrl);
    frontier = next;
  }
  return { ids, files };
};

export const planEntityCleanup = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string
): Promise<EntityCleanup> => {
  const p = reg.prisma;
  const root = { entityType, entityId };
  const { ids, files } = await collectAttached(reg, [root]);
  // The entity and everything attached to it, at any depth, are going.
  const going: Ref[] = [root, ...ATTACHED_TYPES.flatMap((type) => ids[type].map((id) => ({ entityType: type, entityId: id })))];
  const owned = { where: { ownerType: entityType, ownerId: entityId }, data: { ownerType: null, ownerId: null } };
  // Every statement takes one batch of ids, so a delete reaching tens of thousands of rows stays fast
  // and under SQLite's limit on values per statement.
  const byId = (type: AttachedType) => inBatches(ids[type]).map((batch) => ({ where: { id: { in: batch } } }));
  const attached = refBatches(going).map(({ entityType: type, ids: batch }) => ({ where: { entityType: type, entityId: { in: batch } } }));
  const relationEnds = refBatches(going).flatMap(({ entityType: type, ids: batch }) => [
    p.relation.deleteMany({ where: { fromType: type, fromId: { in: batch } } }),
    p.relation.deleteMany({ where: { toType: type, toId: { in: batch } } })
  ]);

  return {
    ops: [
      ...byId('DOC').map((args) => p.doc.deleteMany(args)),
      ...byId('NOTE').map((args) => p.note.deleteMany(args)),
      ...byId('REPORT').map((args) => p.report.deleteMany(args)),
      ...byId('TODO').map((args) => p.todo.deleteMany(args)),
      ...byId('LINK').map((args) => p.link.deleteMany(args)),
      ...byId('COMMENT').map((args) => p.comment.deleteMany(args)),
      ...attached.flatMap((args) => [p.tagAttachment.deleteMany(args), p.emoji.deleteMany(args), p.pageChat.deleteMany(args)]),
      ...relationEnds,
      p.goal.updateMany(owned),
      p.project.updateMany(owned)
    ],
    files,
    folders: [...folderOf(entityType, entityId), ...ids.DOC.flatMap((id) => folderOf('DOC', id))]
  };
};

/**
 * Best effort: a file or folder that can't be removed is logged, not an error. A folder's
 * images go to the trash for a day first (`trashImages`), so text copied from the deleted doc
 * or page can still take them; everything else in it (a PDF) goes now.
 */
export const removeFiles = async (
  reg: Pick<Registry, 'storage' | 'logger' | 'now'>,
  cleanup: Pick<EntityCleanup, 'files' | 'folders'>
): Promise<void> => {
  for (const key of cleanup.files) {
    try {
      await reg.storage.deleteObject(key);
    } catch (error) {
      reg.logger.warn({ key, error }, 'failed to delete a file of a deleted entity');
    }
  }
  for (const folder of cleanup.folders) {
    try {
      await trashImages(reg, folder);
      await reg.storage.deleteFolder(folder);
    } catch (error) {
      reg.logger.warn({ folder, error }, 'failed to delete the files of a deleted entity');
    }
  }
  await purgeTrash(reg);
};
