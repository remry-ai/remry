import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable } from '$api/_archive';
import type { EntityType } from '$shared/types/enums';

// ----- Types -----

export interface TagSummary {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

// ----- Operations -----

export const listTags = async (
  reg: Pick<Registry, 'prisma'>
): Promise<Result<readonly TagSummary[]>> => {
  const tags = await reg.prisma.tag.findMany({ orderBy: { name: 'asc' } });
  return ok(tags.map((t) => ({ id: t.id, name: t.name, color: t.color })));
};

export const createTag = async (
  reg: Pick<Registry, 'prisma'>,
  input: { readonly name: string; readonly color?: string }
): Promise<Result<{ readonly id: string }>> => {
  const existing = await reg.prisma.tag.findUnique({ where: { name: input.name } });
  if (existing) return err(new Error(`Tag "${input.name}" already exists`));

  const tag = await reg.prisma.tag.create({
    data: { name: input.name, color: input.color ?? '#6b7280' }
  });
  return ok({ id: tag.id });
};

export const deleteTag = async (
  reg: Pick<Registry, 'prisma'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.tag.findUnique({ where: { id } });
  if (!existing) return err(new Error('Tag not found'));

  await reg.prisma.tag.delete({ where: { id } });
  return ok({ deleted: true as const });
};

export const listTagsForEntity = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string
): Promise<Result<readonly TagSummary[]>> => {
  const attachments = await reg.prisma.tagAttachment.findMany({
    where: { entityType, entityId },
    include: { tag: true }
  });
  return ok(attachments.map((a) => ({ id: a.tag.id, name: a.tag.name, color: a.tag.color })));
};

export const attachTag = async (
  reg: Pick<Registry, 'prisma'>,
  tagId: string,
  entityType: EntityType,
  entityId: string
): Promise<Result<{ readonly id: string }>> => {
  const tag = await reg.prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag) return err(new Error('Tag not found'));
  const writable = await ensureWritable(reg, entityType, entityId);
  if (!writable.ok) return err(writable.error);

  const attachment = await reg.prisma.tagAttachment.upsert({
    where: { tagId_entityType_entityId: { tagId, entityType, entityId } },
    create: { tagId, entityType, entityId },
    update: {}
  });
  return ok({ id: attachment.id });
};

export const detachTag = async (
  reg: Pick<Registry, 'prisma'>,
  tagId: string,
  entityType: EntityType,
  entityId: string
): Promise<Result<{ readonly detached: true }>> => {
  const existing = await reg.prisma.tagAttachment.findUnique({
    where: { tagId_entityType_entityId: { tagId, entityType, entityId } }
  });
  if (!existing) return err(new Error('Tag not attached'));
  const writable = await ensureWritable(reg, entityType, entityId);
  if (!writable.ok) return err(writable.error);

  await reg.prisma.tagAttachment.delete({
    where: { tagId_entityType_entityId: { tagId, entityType, entityId } }
  });
  return ok({ detached: true as const });
};
