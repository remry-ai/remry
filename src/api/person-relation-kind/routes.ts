import { z } from 'zod';
import { router, procedure } from '$shared/trpc/init';
import {
  createPersonRelationKind,
  deletePersonRelationKind,
  getPersonRelationKind,
  listPersonRelationKinds,
  updatePersonRelationKind
} from './operations';

export const personRelationKindRouter = router({
  list: procedure
    .meta({ description: 'Lists the kinds of relationships between people this notebook uses, with their labels.' })
    .query(({ ctx }) => listPersonRelationKinds(ctx.reg)),

  get: procedure
    .meta({ description: 'One person relationship kind.' })
    .input(z.object({ key: z.string() }))
    .query(({ ctx, input }) => getPersonRelationKind(ctx.reg, input.key)),

  // "Parent of" / "Child of": label reads from the `from` person, inverseLabel from the `to` person.
  // Leave inverseLabel out for a kind that reads the same both ways ("Friend of").
  create: procedure
    .meta({ description: 'Defines a kind of relationship between people, with labels for each direction.' })
    .input(z.object({
      key: z.string().max(40),
      label: z.string().trim().min(1).max(60),
      inverseLabel: z.string().trim().min(1).max(60).optional(),
      // The `to` person has one at most (one lead): adding another replaces it.
      exclusive: z.boolean().optional()
    }))
    .mutation(({ ctx, input }) => createPersonRelationKind(ctx.reg, input)),

  update: procedure
    .meta({ description: 'Changes a person relationship kind\'s labels or order.' })
    .input(z.object({
      key: z.string(),
      label: z.string().trim().min(1).max(60).optional(),
      inverseLabel: z.string().trim().min(1).max(60).optional(),
      sortOrder: z.number().int().optional()
    }))
    .mutation(({ ctx, input: { key, ...data } }) => updatePersonRelationKind(ctx.reg, key, data)),

  delete: procedure
    .meta({ description: 'Deletes a person relationship kind, moving its relationships to another (moveTo).' })
    .input(z.object({ key: z.string(), moveTo: z.string().optional() }))
    .mutation(({ ctx, input }) => deletePersonRelationKind(ctx.reg, input.key, input.moveTo))
});
