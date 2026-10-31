import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { listLinks, findLinks, addLink, markLinkSynced, readLinkFile, removeLink, uploadLinkFile } from './operations';
import { convertFileLink, getFileLinkConversion } from './convert';

// Base64 inflates by a third; this stays under the 25M BODY_SIZE_LIMIT (~18 MB of file), as for a doc's PDF.
const MAX_FILE_BASE64_CHARS = 24_000_000;

const entityTypeEnum = z.enum(ENTITY_TYPES);

export const linkRouter = router({
  list: procedure
    .meta({ description: 'An entity\'s links to outside sources.' })
    .input(z.object({ entityType: entityTypeEnum, entityId: z.string() }))
    .query(({ ctx, input }) => listLinks(ctx.reg, input.entityType, input.entityId)),

  find: procedure
    .meta({ description: 'Finds the entity linked to a URL (or to URLs containing text). Call before importing from another tool, to update instead of duplicating.' })
    .input(z.object({
      url: z.string().min(1).max(2000).optional(),
      contains: z.string().min(1).max(200).optional()
    }))
    .query(({ ctx, input }) => findLinks(ctx.reg, input)),

  add: procedure
    .meta({ description: 'Attaches a URL to an entity. synced: true marks it as imported from that source now.' })
    .input(z.object({
      entityType: entityTypeEnum,
      entityId: z.string(),
      url: z.string().url().max(2000),
      title: z.string().max(200).optional(),
      synced: z.boolean().optional()
    }))
    .mutation(({ ctx, input }) => addLink(ctx.reg, input.entityType, input.entityId, input)),

  read: procedure
    .meta({ description: "Reads a file uploaded as a link (a url starting storage://): a text file's text, or an image or PDF to look at. Not for an outside link: read that with its own tool." })
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => readLinkFile(ctx.reg, input.id)),

  upload: procedure
    .meta({ description: "Uploads a file as a link on a doc or wiki page: stored in its folder, the link points at it (storage://…) and is titled with fileName. Any file you can read (a PDF, an image, Markdown, CSV…). Send one of text (a text file's contents, as they are) or dataBase64 (the file's bytes as base64; a data: URL is fine)." })
    .input(z.object({
      entityType: z.enum(['DOC', 'PAGE']),
      entityId: z.string(),
      fileName: z.string().max(255).optional(),
      text: z.string().max(MAX_FILE_BASE64_CHARS).optional(),
      dataBase64: z.string().max(MAX_FILE_BASE64_CHARS).optional()
    }).refine((input) => (input.text === undefined) !== (input.dataBase64 === undefined), {
      message: 'Send one of text (a text file\'s contents) or dataBase64 (any file\'s bytes as base64), not both.',
      path: ['dataBase64']
    }))
    .mutation(({ ctx, input }) => uploadLinkFile(
      ctx.reg, input.entityType, input.entityId,
      input.text !== undefined ? { text: input.text } : { dataBase64: input.dataBase64 ?? '' },
      input.fileName
    )),

  convert: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => convertFileLink(ctx.reg, ctx.pdfConverter, ctx.notebook.id, input.id)),

  conversion: procedure
    .input(z.object({ entityType: z.enum(['DOC', 'PAGE']), entityId: z.string() }))
    .query(({ ctx, input }) => getFileLinkConversion(ctx.pdfConverter, ctx.notebook.id, input.entityType, input.entityId)),

  markSynced: procedure
    .meta({ description: 'Records that an entity was updated from its linked source now.' })
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => markLinkSynced(ctx.reg, input.id)),

  remove: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => removeLink(ctx.reg, input.id)),
});
