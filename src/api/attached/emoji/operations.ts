import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable } from '$api/_archive';
import type { EntityType } from '$shared/types/enums';

// ----- Types -----

// Single user: each emoji is either on an entity or not.
export interface EmojiSummary {
  readonly emoji: string;
  readonly count: number;
  readonly userReacted: boolean;
}

// ----- Operations -----

export const listEmojis = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string
): Promise<Result<readonly EmojiSummary[]>> => {
  const emojis = await reg.prisma.emoji.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'asc' }
  });
  return ok(emojis.map((e) => ({ emoji: e.emoji, count: 1, userReacted: true })));
};

export const toggleEmoji = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string,
  emoji: string
): Promise<Result<{ readonly added: boolean }>> => {
  const writable = await ensureWritable(reg, entityType, entityId);
  if (!writable.ok) return err(writable.error);
  const existing = await reg.prisma.emoji.findUnique({
    where: { entityType_entityId_emoji: { entityType, entityId, emoji } }
  });

  if (existing) {
    await reg.prisma.emoji.delete({ where: { id: existing.id } });
    return ok({ added: false });
  }

  await reg.prisma.emoji.create({
    data: { entityType, entityId, emoji }
  });
  return ok({ added: true });
};
