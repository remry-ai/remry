import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { listComments, addComment, removeComment } from './operations';

const entityTypeEnum = z.enum(ENTITY_TYPES);

export const commentRouter = router({
  list: procedure
    .input(z.object({ entityType: entityTypeEnum, entityId: z.string() }))
    .query(({ ctx, input }) => listComments(ctx.reg, input.entityType, input.entityId)),

  add: procedure
    .input(z.object({
      entityType: entityTypeEnum,
      entityId: z.string(),
      content: z.string().min(1).max(5000)
    }))
    .mutation(({ ctx, input }) => addComment(ctx.reg, input.entityType, input.entityId, input)),

  remove: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => removeComment(ctx.reg, input.id)),
});
