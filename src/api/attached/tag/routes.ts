import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { listTags, createTag, deleteTag, listTagsForEntity, attachTag, detachTag } from './operations';

const entityTypeEnum = z.enum(ENTITY_TYPES);

export const tagRouter = router({
  list: procedure
    .query(({ ctx }) => listTags(ctx.reg)),

  create: procedure
    .input(z.object({
      name: z.string().min(1).max(50),
      color: z.string().max(20).optional()
    }))
    .mutation(({ ctx, input }) => createTag(ctx.reg, input)),

  delete: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => deleteTag(ctx.reg, input.id)),

  forEntity: procedure
    .input(z.object({ entityType: entityTypeEnum, entityId: z.string() }))
    .query(({ ctx, input }) => listTagsForEntity(ctx.reg, input.entityType, input.entityId)),

  attach: procedure
    .input(z.object({ tagId: z.string(), entityType: entityTypeEnum, entityId: z.string() }))
    .mutation(({ ctx, input }) => attachTag(ctx.reg, input.tagId, input.entityType, input.entityId)),

  detach: procedure
    .input(z.object({ tagId: z.string(), entityType: entityTypeEnum, entityId: z.string() }))
    .mutation(({ ctx, input }) => detachTag(ctx.reg, input.tagId, input.entityType, input.entityId)),
});
