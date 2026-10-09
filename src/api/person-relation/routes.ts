import { z } from 'zod';
import { router, procedure } from '$shared/trpc/init';
import { ok } from '$shared/utils';
import { groupRelations } from '$api/relation/operations';
import {
  addPersonRelation,
  listPersonRelationItems,
  removePersonRelation,
  updatePersonRelation
} from './operations';
import { loadPersonRelationKinds } from '$api/person-relation-kind/operations';

export const personRelationRouter = router({
  // A person's relationships, grouped by how they read from their side ("Child of").
  forPerson: procedure
    .input(z.object({ personId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [items, kinds] = await Promise.all([listPersonRelationItems(ctx.reg, input.personId), loadPersonRelationKinds(ctx.reg)]);
      return ok(groupRelations(items, kinds));
    }),

  // From `fromId` to `toId`: the kind's label reads from `fromId` ("Jo" is "Parent of" "Sam").
  add: procedure
    .input(z.object({
      fromId: z.string().min(1),
      toId: z.string().min(1),
      kind: z.string().max(40),
      note: z.string().max(1000).optional()
    }))
    .mutation(({ ctx, input }) => addPersonRelation(ctx.reg, input)),

  update: procedure
    .input(z.object({
      id: z.string(),
      kind: z.string().max(40).optional(),
      note: z.string().max(1000).nullable().optional()
    }))
    .mutation(({ ctx, input: { id, ...data } }) => updatePersonRelation(ctx.reg, id, data)),

  remove: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => removePersonRelation(ctx.reg, input.id))
});
