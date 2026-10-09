import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { listNotes, addNote, updateNote, removeNote } from './operations';

const entityTypeEnum = z.enum(ENTITY_TYPES);

export const noteRouter = router({
  list: procedure
    .input(z.object({ entityType: entityTypeEnum, entityId: z.string() }))
    .query(({ ctx, input }) => listNotes(ctx.reg, input.entityType, input.entityId)),

  add: procedure
    .input(z.object({
      entityType: entityTypeEnum,
      entityId: z.string(),
      content: z.string().min(1).max(5000),
      parentId: z.string().optional()
    }))
    .mutation(({ ctx, input }) => addNote(ctx.reg, input.entityType, input.entityId, input)),

  update: procedure
    .input(z.object({ id: z.string(), content: z.string().min(1).max(5000) }))
    .mutation(({ ctx, input }) =>
      updateNote(ctx.reg, input.id, { content: input.content })
    ),

  remove: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => removeNote(ctx.reg, input.id)),
});
