import { z } from 'zod';
import { ARCHIVE_FILTERS } from '$shared/types/enums';
import { PAGE_BODY_TYPES } from '$shared/types/pages';
import { router, procedure } from '$shared/trpc/init';
import { setArchived } from '$api/_archive';
import { createPage, deletePage, getPage, listPages, queryPages, updatePage, uploadPageImage } from './operations';
import { EDITOR_IMAGE_TYPES, MAX_IMAGE_BASE64_CHARS } from '$api/_images';

// A kind key; whether the notebook has that kind is checked in the operation.
const kind = z.string().max(40);

// doc: content is markdown. sheet: content is JSON, {"columns":[{"title":"Item"},{"title":"Cost"}],"data":[["Rent","1200"],["Total","=SUM(B1:B1)"]]};
// cells are strings, and a cell starting with = is a formula the app evaluates.
const bodyType = z.enum(PAGE_BODY_TYPES);

// Values are validated per kind in the operation (src/shared/types/pages.ts).
const properties = z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string()).readonly(), z.null()]));

export const pageRouter = router({
  list: procedure
    .meta({ description: 'Lists wiki pages (titles, kinds, the page tree), optionally of one kind or under one parent.' })
    .input(z.object({
      kind: kind.optional(),
      parentId: z.string().nullable().optional(),
      archived: z.enum(ARCHIVE_FILTERS).default('exclude')
    }).default({}))
    .query(({ ctx, input }) => listPages(ctx.reg, input)),

  get: procedure
    .meta({ description: 'One wiki page with its content and properties.' })
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => getPage(ctx.reg, input.id)),

  // A kind's pages as a dataset. Filters are `field:op[:value]` (ops: is, not,
  // anyOf with values split by |, contains, gte, lte, empty, set), sort is
  // `field[:asc|desc]`, aggregates are `field:sum|avg|min|max` on number fields.
  query: procedure
    .meta({ description: 'Queries a page kind\'s pages as a dataset: filters (field:op:value), sort, groupBy and aggregates (field:sum).' })
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
    .meta({ description: 'Creates a wiki page of a kind, with markdown content and the kind\'s properties.' })
    .input(z.object({
      title: z.string().min(1).max(200),
      kind: kind.optional(),
      bodyType: bodyType.optional(),
      parentId: z.string().optional(),
      content: z.string().optional(),
      properties: properties.optional()
    }))
    .mutation(({ ctx, input }) => createPage(ctx.reg, input)),

  update: procedure
    .meta({ description: 'Changes a page\'s title, kind, parent, content, properties or prompt (which makes it a synthesis of its linked sources; null clears it).' })
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      kind: kind.optional(),
      bodyType: bodyType.optional(),
      parentId: z.string().nullable().optional(),
      content: z.string().optional(),
      prompt: z.string().max(2000).nullable().optional(),
      properties: properties.optional()
    }))
    .mutation(({ ctx, input: { id, ...data } }) => updatePage(ctx.reg, id, data)),

  uploadImage: procedure
    .meta({ description: 'Uploads an image (base64) pasted or dropped into a page\'s content and returns its key, for ![alt](storage://<key>).' })
    .input(z.object({
      pageId: z.string(),
      contentType: z.enum(EDITOR_IMAGE_TYPES),
      dataBase64: z.string().max(MAX_IMAGE_BASE64_CHARS)
    }))
    .mutation(({ ctx, input }) => uploadPageImage(ctx.reg, input.pageId, input.contentType, input.dataBase64)),

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
