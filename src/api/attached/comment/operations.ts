import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable } from '$api/_archive';
import type { EntityType } from '$shared/types/enums';

// ----- Types -----

export interface CommentSummary {
  readonly id: string;
  readonly content: string;
  readonly createdAt: Date;
}

// ----- Operations -----

export const listComments = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string
): Promise<Result<readonly CommentSummary[]>> => {
  const comments = await reg.prisma.comment.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'asc' }
  });
  return ok(comments.map((c) => ({
    id: c.id,
    content: c.content,
    createdAt: c.createdAt
  })));
};

export const addComment = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string,
  input: { readonly content: string }
): Promise<Result<{ readonly id: string }>> => {
  const writable = await ensureWritable(reg, entityType, entityId);
  if (!writable.ok) return err(writable.error);
  const comment = await reg.prisma.comment.create({
    data: {
      entityType,
      entityId,
      content: input.content
    }
  });
  return ok({ id: comment.id });
};

export const removeComment = async (
  reg: Pick<Registry, 'prisma'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.comment.findUnique({ where: { id } });
  if (!existing) return err(new Error('Comment not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  await reg.prisma.comment.delete({ where: { id } });
  return ok({ deleted: true as const });
};
