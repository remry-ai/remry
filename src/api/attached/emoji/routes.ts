import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { listEmojis, toggleEmoji } from './operations';

const entityTypeEnum = z.enum(ENTITY_TYPES);

export const emojiRouter = router({
  list: procedure
    .input(z.object({ entityType: entityTypeEnum, entityId: z.string() }))
    .query(({ ctx, input }) => listEmojis(ctx.reg, input.entityType, input.entityId)),

  toggle: procedure
    .input(z.object({
      entityType: entityTypeEnum,
      entityId: z.string(),
      emoji: z.string().min(1).max(10)
    }))
    .mutation(({ ctx, input }) => toggleEmoji(ctx.reg, input.entityType, input.entityId, input.emoji)),
});
