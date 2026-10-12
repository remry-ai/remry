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
    .meta({ description: 'Lists the notebook\'s page kinds with their fields.' })
    .query(({ ctx }) => listPageKinds(ctx.reg)),

  get: procedure
    .meta({ description: 'One page kind with its fields.' })
    .input(z.object({ key: z.string() }))
    .query(({ ctx, input }) => getPageKind(ctx.reg, input.key)),

  create: procedure
    .meta({ description: 'Defines a page kind (EXPENSE, RECIPE…) and its typed fields. Propose the fields to the user first.' })
    .input(z.object({
      key: z.string().max(40),
      name: z.string().trim().min(1).max(60),
      description: z.string().max(500).nullable().optional(),
      fields: fields.optional()
    }))
    .mutation(({ ctx, input }) => createPageKind(ctx.reg, input)),

  update: procedure
    .meta({ description: 'Changes a page kind\'s name, description, fields or order.' })
    .input(z.object({
      key: z.string(),
      name: z.string().trim().min(1).max(60).optional(),
      description: z.string().max(500).nullable().optional(),
      fields: fields.optional(),
      sortOrder: z.number().int().optional()
    }))
    .mutation(({ ctx, input: { key, ...data } }) => updatePageKind(ctx.reg, key, data)),

  delete: procedure
    .meta({ description: 'Deletes a page kind, moving its pages to another kind (moveTo).' })
    .input(z.object({ key: z.string(), moveTo: z.string().optional() }))
    .mutation(({ ctx, input }) => deletePageKind(ctx.reg, input.key, input.moveTo))
});
