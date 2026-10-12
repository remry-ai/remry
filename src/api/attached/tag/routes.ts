import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { listTags, createTag, deleteTag, listTagsForEntity, attachTag, detachTag } from './operations';

const entityTypeEnum = z.enum(ENTITY_TYPES);

export const tagRouter = router({
  list: procedure
    .meta({ description: 'Lists the notebook\'s tags.' })
    .query(({ ctx }) => listTags(ctx.reg)),

  create: procedure
    .meta({ description: 'Creates a tag.' })
    .input(z.object({
      name: z.string().min(1).max(50),
      color: z.string().max(20).optional()
    }))
    .mutation(({ ctx, input }) => createTag(ctx.reg, input)),

  delete: procedure
    .meta({ description: 'Deletes a tag from the notebook and every entity it is on.' })
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => deleteTag(ctx.reg, input.id)),

  forEntity: procedure
    .meta({ description: 'An entity\'s tags.' })
    .input(z.object({ entityType: entityTypeEnum, entityId: z.string() }))
    .query(({ ctx, input }) => listTagsForEntity(ctx.reg, input.entityType, input.entityId)),

  attach: procedure
    .meta({ description: 'Puts a tag on an entity.' })
    .input(z.object({ tagId: z.string(), entityType: entityTypeEnum, entityId: z.string() }))
    .mutation(({ ctx, input }) => attachTag(ctx.reg, input.tagId, input.entityType, input.entityId)),

  detach: procedure
    .meta({ description: 'Takes a tag off an entity.' })
    .input(z.object({ tagId: z.string(), entityType: entityTypeEnum, entityId: z.string() }))
    .mutation(({ ctx, input }) => detachTag(ctx.reg, input.tagId, input.entityType, input.entityId)),
});
