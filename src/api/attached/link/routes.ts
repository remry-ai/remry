import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { listLinks, findLinks, addLink, markLinkSynced, readLinkFile, removeLink, updateLink, uploadLinkFile } from './operations';
import { convertFileLink, getFileLinkConversion, transcribeFileLink } from './convert';
import { FILE_LINK_HOLDERS } from '$shared/utils/file-links';

// Base64 inflates by a third; this stays under the 25M BODY_SIZE_LIMIT (~18 MB of file), as for a doc's PDF.
const MAX_FILE_BASE64_CHARS = 24_000_000;
/** A file link's saved text: a long PDF's worth. */
const MAX_SAVED_TEXT_CHARS = 2_000_000;

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
    .meta({ description: "Attaches a URL to an entity. synced: true marks it as imported from that source now, with sourceEditedAt the source's own last-edited time." })
    .input(z.object({
      entityType: entityTypeEnum,
      entityId: z.string(),
      url: z.string().url().max(2000),
      title: z.string().max(200).optional(),
      synced: z.boolean().optional(),
      sourceEditedAt: z.coerce.date().optional()
    }))
    .mutation(({ ctx, input }) => addLink(ctx.reg, input.entityType, input.entityId, input)),

  read: procedure
    .meta({ description: "Reads a file uploaded as a link (a url starting storage://): its saved text when it has one, else the file (a text file's text, or an image or PDF to look at). original: true opens the file itself. Not for an outside link: read that with its own tool." })
    .input(z.object({ id: z.string(), original: z.boolean().optional() }))
    .query(({ ctx, input }) => readLinkFile(ctx.reg, input.id, { original: input.original })),

  update: procedure
    .meta({ description: "Renames a link, or saves a file link's text (what you read in its PDF or image) so later reads return that instead of the file; text: null clears it." })
    .input(z.object({
      id: z.string(),
      title: z.string().max(200).nullable().optional(),
      text: z.string().max(MAX_SAVED_TEXT_CHARS).nullable().optional()
    }))
    .mutation(({ ctx, input }) => updateLink(ctx.reg, input.id, input)),

  upload: procedure
    .meta({ description: "Uploads a file as a link on a person, group, project, goal, wiki page or doc: stored in its folder, the link points at it (storage://…) and is titled with fileName. Any file you can read (a PDF, an image, Markdown, CSV…). Send one of text (a text file's contents, as they are) or dataBase64 (the file's bytes as base64; a data: URL is fine)." })
    .input(z.object({
      entityType: z.enum(FILE_LINK_HOLDERS),
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

  // The web app's "Re-read": saves a file link's text with the local Claude (link.conversion with LINK and its id until done).
  transcribe: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => transcribeFileLink(ctx.reg, ctx.pdfConverter, ctx.notebook.id, input.id)),

  conversion: procedure
    .input(z.object({ entityType: z.enum(['DOC', 'PAGE', 'LINK']), entityId: z.string() }))
    .query(({ ctx, input }) => getFileLinkConversion(ctx.pdfConverter, ctx.notebook.id, input.entityType, input.entityId)),

  markSynced: procedure
    .meta({ description: "Records that an entity was updated from its linked source now, or checked and found current. Pass sourceEditedAt, the source's own last-edited time, so the next check compares that instead of reading the source." })
    .input(z.object({ id: z.string(), sourceEditedAt: z.coerce.date().optional() }))
    .mutation(({ ctx, input }) => markLinkSynced(ctx.reg, input.id, input.sourceEditedAt)),

  remove: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => removeLink(ctx.reg, input.id)),
});
