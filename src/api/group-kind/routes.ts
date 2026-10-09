import { z } from 'zod';
import { router, procedure } from '$shared/trpc/init';
import { createGroupKind, deleteGroupKind, getGroupKind, listGroupKinds, updateGroupKind } from './operations';

export const groupKindRouter = router({
  list: procedure
    .query(({ ctx }) => listGroupKinds(ctx.reg)),

  get: procedure
    .input(z.object({ key: z.string() }))
    .query(({ ctx, input }) => getGroupKind(ctx.reg, input.key)),

  create: procedure
    .input(z.object({
      key: z.string().max(40),
      name: z.string().trim().min(1).max(60),
      plural: z.string().trim().min(1).max(60).optional(),
      // A person is in at most one group of an exclusive kind (like a department).
      exclusive: z.boolean().optional()
    }))
    .mutation(({ ctx, input }) => createGroupKind(ctx.reg, input)),

  update: procedure
    .input(z.object({
      key: z.string(),
      name: z.string().trim().min(1).max(60).optional(),
      plural: z.string().trim().min(1).max(60).optional(),
      exclusive: z.boolean().optional(),
      sortOrder: z.number().int().optional()
    }))
    .mutation(({ ctx, input: { key, ...data } }) => updateGroupKind(ctx.reg, key, data)),

  delete: procedure
    .input(z.object({ key: z.string(), moveTo: z.string().optional() }))
    .mutation(({ ctx, input }) => deleteGroupKind(ctx.reg, input.key, input.moveTo))
});
