import { z } from 'zod';
import { ARCHIVE_FILTERS } from '$shared/types/enums';
import { PAGE_BODY_TYPES } from '$shared/types/pages';
import { router, procedure } from '$shared/trpc/init';
import { setArchived } from '$api/_archive';
import { createPage, deletePage, getPage, listPages, updatePage, uploadPageImage } from './operations';
import { EDITOR_IMAGE_TYPES, MAX_IMAGE_BASE64_CHARS } from '$api/_images';

// doc: content is markdown. sheet: content is JSON, {"columns":[{"title":"Item"},{"title":"Cost"}],"data":[["Rent","1200"],["Total","=SUM(B1:B1)"]]};
// cells are strings, and a cell starting with = is a formula the app evaluates.
const bodyType = z.enum(PAGE_BODY_TYPES);

export const pageRouter = router({
  list: procedure
    .meta({ description: 'Lists wiki pages (titles and the page tree), optionally under one parent.' })
    .input(z.object({
      parentId: z.string().nullable().optional(),
      archived: z.enum(ARCHIVE_FILTERS).default('exclude')
    }).default({}))
    .query(({ ctx, input }) => listPages(ctx.reg, input)),

  get: procedure
    .meta({ description: 'One wiki page with its content.' })
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => getPage(ctx.reg, input.id)),

  create: procedure
    .meta({ description: 'Creates a wiki page with markdown content (or, with bodyType sheet, a spreadsheet).' })
    .input(z.object({
      title: z.string().min(1).max(200),
      bodyType: bodyType.optional(),
      parentId: z.string().optional(),
      content: z.string().optional()
    }))
    .mutation(({ ctx, input }) => createPage(ctx.reg, input)),

  update: procedure
    .meta({ description: 'Changes a page\'s title, parent, content or prompt (which makes it a sync doc, rewritten from its linked sources; null clears it).' })
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      bodyType: bodyType.optional(),
      parentId: z.string().nullable().optional(),
      content: z.string().optional(),
      prompt: z.string().max(2000).nullable().optional()
    }))
    .mutation(({ ctx, input: { id, ...data } }) => updatePage(ctx.reg, id, data)),

  uploadImage: procedure
    .meta({ description: "Uploads an image to a wiki page and returns its key and the markdown to put in the content (then page.update). dataBase64 is the file's bytes as base64 (a data: URL is fine); the bytes decide PNG, JPEG, GIF or WebP." })
    .input(z.object({
      pageId: z.string(),
      // Optional: the bytes decide. The app sends it.
      contentType: z.enum(EDITOR_IMAGE_TYPES).optional(),
      dataBase64: z.string().max(MAX_IMAGE_BASE64_CHARS)
    }))
    .mutation(({ ctx, input }) => uploadPageImage(ctx.reg, input.pageId, input.dataBase64)),

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
