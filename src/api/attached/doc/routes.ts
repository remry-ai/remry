import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { listDocs, listDocTitles, getDoc, addDoc, updateDoc, removeDoc, reorderDocs, attachSourcePdf, getDocReadUrl, uploadDocImage, DOC_IMAGE_TYPES } from './operations';
import { MAX_IMAGE_BASE64_CHARS } from '$api/_images';
import { convertDocPdf, getPdfConversion } from './convert';

// Base64 inflates by a third; this stays under the 25M BODY_SIZE_LIMIT (~18 MB of PDF).
const MAX_PDF_BASE64_CHARS = 24_000_000;

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
    .meta({ description: 'Creates an empty doc on an entity. Write its content with doc.update.' })
    .input(z.object({
      entityType: z.enum(ENTITY_TYPES),
      entityId: z.string(),
      title: z.string().min(1).max(200)
    }))
    .mutation(({ ctx, input }) => addDoc(ctx.reg, input.entityType, input.entityId, input)),

  update: procedure
    .meta({ description: 'Changes a doc\'s title, markdown content (fenced chart and mermaid blocks render) or prompt (which makes it a sync doc, rewritten from its linked sources; null clears it).' })
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      content: z.string().optional(),
      prompt: z.string().max(2000).nullable().optional()
    }))
    .mutation(({ ctx, input }) => updateDoc(ctx.reg, input.id, input)),

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

  attachSource: procedure
    .meta({ description: "Attaches the original PDF to a doc whose markdown you wrote from it. dataBase64 is the file's bytes as base64 (a data: URL is fine)." })
    .input(z.object({
      docId: z.string(),
      // Optional: the bytes must be a PDF. The app sends it.
      contentType: z.literal('application/pdf').optional(),
      dataBase64: z.string().max(MAX_PDF_BASE64_CHARS)
    }))
    .mutation(({ ctx, input }) => attachSourcePdf(ctx.reg, input.docId, input.dataBase64)),

  uploadImage: procedure
    .meta({ description: "Uploads an image to a doc and returns its key and the markdown to put in the content (then doc.update). dataBase64 is the file's bytes as base64 (a data: URL is fine); the bytes decide PNG, JPEG, GIF or WebP." })
    .input(z.object({
      docId: z.string(),
      // Optional: the bytes decide. The app sends it.
      contentType: z.enum(DOC_IMAGE_TYPES).optional(),
      dataBase64: z.string().max(MAX_IMAGE_BASE64_CHARS)
    }))
    .mutation(({ ctx, input }) => uploadDocImage(ctx.reg, input.docId, input.dataBase64)),

  getReadUrl: procedure
    .meta({ description: 'The app URL of a doc\'s attached PDF.' })
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => getDocReadUrl(ctx.reg, input.id)),

  // Web app only (hidden from the CLI and MCP in cli/api.ts).
  convertPdf: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => convertDocPdf(ctx.reg, ctx.pdfConverter, ctx.notebook.id, input.id)),

  pdfConversion: procedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => getPdfConversion(ctx.pdfConverter, ctx.notebook.id, input.id))
});
