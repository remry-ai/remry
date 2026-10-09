import { z } from 'zod';
import { ARCHIVE_FILTERS } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { setArchived } from '$api/_archive';
import { createPage, deletePage, getPage, listPages, queryPages, updatePage } from './operations';

// A kind key; whether the notebook has that kind is checked in the operation.
const kind = z.string().max(40);

// Values are validated per kind in the operation (src/shared/types/pages.ts).
const properties = z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string()).readonly(), z.null()]));

export const pageRouter = router({
  list: procedure
    .input(z.object({
      kind: kind.optional(),
      parentId: z.string().nullable().optional(),
      archived: z.enum(ARCHIVE_FILTERS).default('exclude')
    }).default({}))
    .query(({ ctx, input }) => listPages(ctx.reg, input)),

  get: procedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => getPage(ctx.reg, input.id)),

  // A kind's pages as a dataset. Filters are `field:op[:value]` (ops: is, not,
  // anyOf with values split by |, contains, gte, lte, empty, set), sort is
  // `field[:asc|desc]`, aggregates are `field:sum|avg|min|max` on number fields.
  query: procedure
    .input(z.object({
      kind,
      filters: z.array(z.string()).readonly().optional(),
      sort: z.string().optional(),
      groupBy: z.string().optional(),
      aggregates: z.array(z.string()).readonly().optional(),
      archived: z.enum(ARCHIVE_FILTERS).default('exclude')
    }))
    .query(({ ctx, input }) => queryPages(ctx.reg, input)),

  create: procedure
    .input(z.object({
      title: z.string().min(1).max(200),
      kind: kind.optional(),
      parentId: z.string().optional(),
      content: z.string().optional(),
      properties: properties.optional()
    }))
    .mutation(({ ctx, input }) => createPage(ctx.reg, input)),

  update: procedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      kind: kind.optional(),
      parentId: z.string().nullable().optional(),
      content: z.string().optional(),
      properties: properties.optional()
    }))
    .mutation(({ ctx, input: { id, ...data } }) => updatePage(ctx.reg, id, data)),

  archive: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => setArchived(ctx.reg, 'PAGE', input.id, true)),

  unarchive: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => setArchived(ctx.reg, 'PAGE', input.id, false)),

  delete: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => deletePage(ctx.reg, input.id))
});
