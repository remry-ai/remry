import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { listLinks, findLinks, addLink, markLinkSynced, removeLink } from './operations';

const entityTypeEnum = z.enum(ENTITY_TYPES);

export const linkRouter = router({
  list: procedure
    .meta({ description: 'An entity\'s links to outside sources.' })
    .input(z.object({ entityType: entityTypeEnum, entityId: z.string() }))
    .query(({ ctx, input }) => listLinks(ctx.reg, input.entityType, input.entityId)),

  find: procedure
    .meta({ description: 'Finds the entity linked to a URL (or to URLs containing text). Call before importing from another tool, to update instead of duplicating.' })
    .input(z.object({
      url: z.string().min(1).max(2000).optional(),
      contains: z.string().min(1).max(200).optional()
    }))
    .query(({ ctx, input }) => findLinks(ctx.reg, input)),

  add: procedure
    .meta({ description: 'Attaches a URL to an entity. synced: true marks it as imported from that source now.' })
    .input(z.object({
      entityType: entityTypeEnum,
      entityId: z.string(),
      url: z.string().url().max(2000),
      title: z.string().max(200).optional(),
      synced: z.boolean().optional()
    }))
    .mutation(({ ctx, input }) => addLink(ctx.reg, input.entityType, input.entityId, input)),

  markSynced: procedure
    .meta({ description: 'Records that an entity was updated from its linked source now.' })
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => markLinkSynced(ctx.reg, input.id)),

  remove: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => removeLink(ctx.reg, input.id)),
});
