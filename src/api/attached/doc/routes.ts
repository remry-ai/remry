import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { BODY_TYPES } from '$shared/types/body-types';
import { router, procedure } from '$shared/trpc/init';
import { listDocs, listDocTitles, getDoc, addDocWithContent, updateDoc, removeDoc, reorderDocs, uploadDocImage, DOC_IMAGE_TYPES } from './operations';
import { MAX_IMAGE_BASE64_CHARS } from '$api/_images';
import { becomesDrawing, drawingGated, makesSyncDoc, syncDocGated } from '$api/_license';

export const docRouter = router({
  list: procedure
    .meta({ description: 'An entity\'s docs (titles, no content).' })
    .input(z.object({ entityType: z.enum(ENTITY_TYPES), entityId: z.string() }))
    .query(({ ctx, input }) => listDocs(ctx.reg, input.entityType, input.entityId)),

  titles: procedure
    .meta({ description: 'Every doc\'s title and where it opens, without content (the app\'s finder).' })
    .query(({ ctx }) => listDocTitles(ctx.reg)),

  get: procedure
    .meta({ description: 'One doc with its markdown content.' })
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => getDoc(ctx.reg, input.id)),

  add: procedure
    .meta({ description: 'Creates a doc on an entity: markdown, or with bodyType sheet a spreadsheet, with bodyType drawing a diagram (the same content as a wiki page of that type). content is optional (empty without it); doc.update changes it later.' })
    .input(z.object({
      entityType: z.enum(ENTITY_TYPES),
      entityId: z.string(),
      title: z.string().min(1).max(200),
      bodyType: z.enum(BODY_TYPES).optional(),
      content: z.string().optional()
    }))
    .mutation(({ ctx, input }) => drawingGated(ctx, ctx.reg, input.bodyType === 'drawing', () => addDocWithContent(ctx.reg, input.entityType, input.entityId, input))),

  update: procedure
    .meta({ description: 'Changes a doc\'s title, content (markdown, where fenced chart and mermaid blocks render; a sheet\'s or drawing\'s JSON for those docs), bodyType (only while empty), or prompt (which makes it a sync doc, rewritten from its linked sources; null clears it), or moves it to another entity (entityType + entityId), keeping its images, links and notes.' })
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      content: z.string().optional(),
      bodyType: z.enum(BODY_TYPES).optional(),
      prompt: z.string().max(2000).nullable().optional(),
      entityType: z.enum(ENTITY_TYPES).optional(),
      entityId: z.string().optional()
    }))
    // A new drawing past the free ones, or a first prompt (a new sync doc), is Remry Pro.
    .mutation(async ({ ctx, input }) => {
      const [drawing, sync] = await Promise.all([
        becomesDrawing(ctx.reg, 'DOC', input.id, input.bodyType),
        makesSyncDoc(ctx.reg, 'DOC', input.id, input.prompt)
      ]);
      return drawingGated(ctx, ctx.reg, drawing, () => syncDocGated(ctx, sync, () => updateDoc(ctx.reg, input.id, input)));
    }),

  remove: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => removeDoc(ctx.reg, input.id)),

  reorder: procedure
    .meta({ description: 'Sets the order of an entity\'s docs.' })
    .input(z.object({
      entityType: z.enum(ENTITY_TYPES),
      entityId: z.string(),
      docIds: z.array(z.string())
    }))
    .mutation(({ ctx, input }) => reorderDocs(ctx.reg, input.entityType, input.entityId, input.docIds)),

  uploadImage: procedure
    .meta({ description: "Uploads an image to a doc and returns its key and the markdown to put in the content (then doc.update). dataBase64 is the file's bytes as base64 (a data: URL is fine); the bytes decide PNG, JPEG, GIF or WebP." })
    .input(z.object({
      docId: z.string(),
      // Optional: the bytes decide. The app sends it.
      contentType: z.enum(DOC_IMAGE_TYPES).optional(),
      dataBase64: z.string().max(MAX_IMAGE_BASE64_CHARS)
    }))
    .mutation(({ ctx, input }) => uploadDocImage(ctx.reg, input.docId, input.dataBase64))
});
