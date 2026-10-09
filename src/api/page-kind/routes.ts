import { z } from 'zod';
import { router, procedure } from '$shared/trpc/init';
import { pageKindFieldSchema, type PageKindField } from '$shared/types/pages';
import { createPageKind, deletePageKind, getPageKind, listPageKinds, updatePageKind } from './operations';

// The field rules (key format, options for select and multiselect, money format)
// live in pageKindFieldSchema; the operations check a field change against the
// kind's pages.
const fields = z.array(pageKindFieldSchema).readonly().transform((value) => value as readonly PageKindField[]);

export const pageKindRouter = router({
  list: procedure
    .query(({ ctx }) => listPageKinds(ctx.reg)),

  get: procedure
    .input(z.object({ key: z.string() }))
    .query(({ ctx, input }) => getPageKind(ctx.reg, input.key)),

  create: procedure
    .input(z.object({
      key: z.string().max(40),
      name: z.string().trim().min(1).max(60),
      description: z.string().max(500).nullable().optional(),
      fields: fields.optional()
    }))
    .mutation(({ ctx, input }) => createPageKind(ctx.reg, input)),

  update: procedure
    .input(z.object({
      key: z.string(),
      name: z.string().trim().min(1).max(60).optional(),
      description: z.string().max(500).nullable().optional(),
      fields: fields.optional(),
      sortOrder: z.number().int().optional()
    }))
    .mutation(({ ctx, input: { key, ...data } }) => updatePageKind(ctx.reg, key, data)),

  delete: procedure
    .input(z.object({ key: z.string(), moveTo: z.string().optional() }))
    .mutation(({ ctx, input }) => deletePageKind(ctx.reg, input.key, input.moveTo))
});
