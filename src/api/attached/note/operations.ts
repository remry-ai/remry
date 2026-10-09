import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable } from '$api/_archive';
import type { EntityType } from '$shared/types/enums';
import { relationCleanupOp } from '$api/_entity-cleanup';
import { syncMentions } from '$api/relation/mentions';

// ----- Types -----

export interface NoteSummary {
  readonly id: string;
  readonly parentId: string | null;
  readonly content: string;
  readonly createdAt: Date;
}

export interface NoteTree extends NoteSummary {
  readonly replies: readonly NoteTree[];
}

// ----- Operations -----

export const listNotes = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string
): Promise<Result<readonly NoteSummary[]>> => {
  const notes = await reg.prisma.note.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'asc' }
  });
  return ok(notes.map((n) => ({
    id: n.id,
    parentId: n.parentId,
    content: n.content,
    createdAt: n.createdAt
  })));
};

export const addNote = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string,
  input: { readonly content: string; readonly parentId?: string }
): Promise<Result<{ readonly id: string }>> => {
  const writable = await ensureWritable(reg, entityType, entityId);
  if (!writable.ok) return err(writable.error);
  const note = await reg.prisma.note.create({
    data: {
      entityType,
      entityId,
      content: input.content,
      parentId: input.parentId
    }
  });
  await syncMentions(reg, { entityType: 'NOTE', entityId: note.id }, input.content);
  return ok({ id: note.id });
};

export const updateNote = async (
  reg: Pick<Registry, 'prisma'>,
  id: string,
  input: { readonly content: string }
): Promise<Result<{ readonly id: string }>> => {
  const existing = await reg.prisma.note.findUnique({ where: { id } });
  if (!existing) return err(new Error('Note not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  await reg.prisma.note.update({ where: { id }, data: { content: input.content } });
  await syncMentions(reg, { entityType: 'NOTE', entityId: id }, input.content);
  return ok({ id });
};

export const removeNote = async (
  reg: Pick<Registry, 'prisma'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.note.findUnique({ where: { id } });
  if (!existing) return err(new Error('Note not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  await relationCleanupOp(reg, 'NOTE', id);
  await reg.prisma.note.delete({ where: { id } });
  return ok({ deleted: true as const });
};

// ----- Tree builder -----

export const buildNoteTree = (notes: readonly NoteSummary[]): readonly NoteTree[] => {
  const map = new Map<string, NoteTree>();
  const roots: NoteTree[] = [];

  for (const n of notes) {
    map.set(n.id, { ...n, replies: [] });
  }

  for (const n of notes) {
    const node = map.get(n.id)!;
    if (n.parentId && map.has(n.parentId)) {
      (map.get(n.parentId)!.replies as NoteTree[]).push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
};
