import { z } from 'zod';
import { ENTITY_TYPES, MANUAL_RELATION_KINDS, RELATABLE_TYPES } from '$shared/types/enums';

// MENTIONS come from content; relationships between people are personRelation.*.
const kind = z.enum(MANUAL_RELATION_KINDS);
import { router, procedure } from '$shared/trpc/init';
import { addRelation, listRelationsForEntity, removeRelation, updateRelation } from './operations';

export const relationRouter = router({
  forEntity: procedure
    .meta({ description: 'An entity\'s relations to other entities, both directions, with notes.' })
    .input(z.object({ entityType: z.enum(ENTITY_TYPES), entityId: z.string() }))
    .query(({ ctx, input }) => listRelationsForEntity(ctx.reg, input.entityType, input.entityId)),

  add: procedure
    .meta({ description: 'Links two entities as RELATED or DEPENDS_ON (from depends on to), with an optional note. Not for two people: use personRelation.add.' })
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
    .meta({ description: 'Changes a relation\'s kind or note.' })
    .input(z.object({
      id: z.string(),
      kind: kind.optional(),
      note: z.string().max(1000).nullable().optional()
    }))
    .mutation(({ ctx, input: { id, ...data } }) => updateRelation(ctx.reg, id, data)),

  remove: procedure
    .meta({ description: 'Deletes a relation between two entities.' })
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => removeRelation(ctx.reg, input.id))
});
