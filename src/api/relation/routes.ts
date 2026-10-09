import { z } from 'zod';
import { ENTITY_TYPES, MANUAL_RELATION_KINDS, RELATABLE_TYPES } from '$shared/types/enums';

// MENTIONS come from content; relationships between people are personRelation.*.
const kind = z.enum(MANUAL_RELATION_KINDS);
import { router, procedure } from '$shared/trpc/init';
import { addRelation, listRelationsForEntity, removeRelation, updateRelation } from './operations';

export const relationRouter = router({
  forEntity: procedure
    .input(z.object({ entityType: z.enum(ENTITY_TYPES), entityId: z.string() }))
    .query(({ ctx, input }) => listRelationsForEntity(ctx.reg, input.entityType, input.entityId)),

  add: procedure
    .input(z.object({
      fromType: z.enum(RELATABLE_TYPES),
      fromId: z.string().min(1),
      toType: z.enum(RELATABLE_TYPES),
      toId: z.string().min(1),
      kind: kind.default('RELATED'),
      note: z.string().max(1000).optional()
    }))
    .mutation(({ ctx, input }) => addRelation(ctx.reg, input)),

  update: procedure
    .input(z.object({
      id: z.string(),
      kind: kind.optional(),
      note: z.string().max(1000).nullable().optional()
    }))
    .mutation(({ ctx, input: { id, ...data } }) => updateRelation(ctx.reg, id, data)),

  remove: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => removeRelation(ctx.reg, input.id))
});
