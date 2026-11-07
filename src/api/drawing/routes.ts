import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { excalidrawBackend } from '$shared/drawing/excalidraw-backend.server';
import { importShareLink, shareDrawing } from './operations';

// The only procedures that reach the network, and only excalidraw.com's share-link storage.
export const drawingRouter = router({
  shareLink: procedure
    .meta({ description: "Uploads an encrypted copy of a drawing page (pageId) or drawing doc (docId) to excalidraw.com and returns its share link (anyone with it can open the drawing; it's a snapshot). Only when the user asks to share." })
    .input(z.object({ pageId: z.string().optional(), docId: z.string().optional() }))
    .mutation(({ ctx, input }) => shareDrawing(ctx.reg, excalidrawBackend, input)),

  importLink: procedure
    .meta({ description: 'Makes a drawing page (title, parentId?) or drawing doc (title, entityType, entityId), or fills an empty one (pageId or docId; replace: true to overwrite), from an excalidraw.com share link (#json=<id>,<key>).' })
    .input(z.object({
      url: z.string().min(1).max(2000),
      pageId: z.string().optional(),
      docId: z.string().optional(),
      entityType: z.enum(ENTITY_TYPES).optional(),
      entityId: z.string().optional(),
      title: z.string().min(1).max(200).optional(),
      parentId: z.string().optional(),
      replace: z.boolean().optional()
    }))
    .mutation(({ ctx, input }) => importShareLink(ctx.reg, excalidrawBackend, input))
});
