import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { listDocs, getDoc, addDoc, updateDoc, removeDoc, reorderDocs, attachSourcePdf, getDocReadUrl, uploadDocImage, DOC_IMAGE_TYPES } from './operations';
import { convertDocPdf, getPdfConversion } from './convert';

// Base64 inflates by a third; this stays under the 25M BODY_SIZE_LIMIT (~18 MB of PDF).
const MAX_PDF_BASE64_CHARS = 24_000_000;
const MAX_IMAGE_BASE64_CHARS = 14_000_000; // ~10 MB image

export const docRouter = router({
  list: procedure
    .input(z.object({ entityType: z.enum(ENTITY_TYPES), entityId: z.string() }))
    .query(({ ctx, input }) => listDocs(ctx.reg, input.entityType, input.entityId)),

  get: procedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => getDoc(ctx.reg, input.id)),

  add: procedure
    .input(z.object({
      entityType: z.enum(ENTITY_TYPES),
      entityId: z.string(),
      title: z.string().min(1).max(200)
    }))
    .mutation(({ ctx, input }) => addDoc(ctx.reg, input.entityType, input.entityId, input)),

  update: procedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      content: z.string().optional()
    }))
    .mutation(({ ctx, input }) => updateDoc(ctx.reg, input.id, input)),

  remove: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => removeDoc(ctx.reg, input.id)),

  reorder: procedure
    .input(z.object({
      entityType: z.enum(ENTITY_TYPES),
      entityId: z.string(),
      docIds: z.array(z.string())
    }))
    .mutation(({ ctx, input }) => reorderDocs(ctx.reg, input.entityType, input.entityId, input.docIds)),

  attachSource: procedure
    .input(z.object({
      docId: z.string(),
      contentType: z.literal('application/pdf'),
      dataBase64: z.string().max(MAX_PDF_BASE64_CHARS)
    }))
    .mutation(({ ctx, input }) => attachSourcePdf(ctx.reg, input.docId, input.contentType, input.dataBase64)),

  uploadImage: procedure
    .input(z.object({
      docId: z.string(),
      contentType: z.enum(DOC_IMAGE_TYPES),
      dataBase64: z.string().max(MAX_IMAGE_BASE64_CHARS)
    }))
    .mutation(({ ctx, input }) => uploadDocImage(ctx.reg, input.docId, input.contentType, input.dataBase64)),

  getReadUrl: procedure
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
