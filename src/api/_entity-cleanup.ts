// Cross-domain helper (not a domain): everything that points at an entity
// about to be deleted, and at what's attached to it, at any depth. Attached rows,
// relations and owners have no foreign key, so without this they'd be left behind.
// Run `ops` in the same $transaction as the delete, then remove `files` (PDFs of
// the attached docs) once it commits.

import type { Registry } from '$shared/registry';
import type { EntityType } from '$shared/types/enums';

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

// Mutable arrays: Prisma's where-input types don't accept readonly ones.
const attachedToAny = (refs: readonly Ref[]): { OR: { entityType: string; entityId: { in: string[] } }[] } => {
  const byType = new Map<string, string[]>();
  for (const { entityType, entityId } of refs) byType.set(entityType, [...(byType.get(entityType) ?? []), entityId]);
  return { OR: [...byType].map(([entityType, ids]) => ({ entityType, entityId: { in: ids } })) };
};

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
    const where = attachedToAny(frontier);
    const noteIds = frontier.filter((r) => r.entityType === 'NOTE').map((r) => r.entityId);
    const select = { id: true } as const;
    const [docs, notes, reports, todos, links, comments, replies] = await Promise.all([
      p.doc.findMany({ where, select: { id: true, sourceUrl: true } }),
      p.note.findMany({ where, select }),
      p.report.findMany({ where, select }),
      p.todo.findMany({ where, select }),
      p.link.findMany({ where, select }),
      p.comment.findMany({ where, select }),
      noteIds.length > 0 ? p.note.findMany({ where: { parentId: { in: noteIds } }, select }) : Promise.resolve([])
    ]);

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
  const attached = { where: attachedToAny(going) };
  const byId = (type: AttachedType) => ({ where: { id: { in: [...ids[type]] } } });
  const ends = attachedToAny(going).OR;
  const owned = { where: { ownerType: entityType, ownerId: entityId }, data: { ownerType: null, ownerId: null } };

  return {
    ops: [
      p.doc.deleteMany(byId('DOC')),
      p.note.deleteMany(byId('NOTE')),
      p.report.deleteMany(byId('REPORT')),
      p.todo.deleteMany(byId('TODO')),
      p.link.deleteMany(byId('LINK')),
      p.comment.deleteMany(byId('COMMENT')),
      p.tagAttachment.deleteMany(attached),
      p.emoji.deleteMany(attached),
      p.pageChat.deleteMany(attached),
      p.relation.deleteMany({
        where: {
          OR: [
            ...ends.map((e) => ({ fromType: e.entityType, fromId: e.entityId })),
            ...ends.map((e) => ({ toType: e.entityType, toId: e.entityId }))
          ]
        }
      }),
      p.goal.updateMany(owned),
      p.project.updateMany(owned)
    ],
    files,
    folders: [...folderOf(entityType, entityId), ...ids.DOC.flatMap((id) => folderOf('DOC', id))]
  };
};

/** Best effort: a file or folder that can't be removed is logged, not an error. */
export const removeFiles = async (
  reg: Pick<Registry, 'storage' | 'logger'>,
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
      await reg.storage.deleteFolder(folder);
    } catch (error) {
      reg.logger.warn({ folder, error }, 'failed to delete the files of a deleted entity');
    }
  }
};
