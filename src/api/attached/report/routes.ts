import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import {
  listReports,
  listReportsForEntity,
  getReport,
  createReport,
  updateReport,
  removeReport
} from './operations';

const title = z.string().min(1).max(200);
// Markdown with ```chart blocks; validated in the operation so errors name the line.
const content = z.string().max(500_000);

export const reportRouter = router({
  list: procedure.query(({ ctx }) => listReports(ctx.reg)),

  forEntity: procedure
    .input(z.object({ entityType: z.enum(ENTITY_TYPES), entityId: z.string() }))
    .query(({ ctx, input }) => listReportsForEntity(ctx.reg, input.entityType, input.entityId)),

  get: procedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => getReport(ctx.reg, input.id)),

  create: procedure
    .input(z.object({
      entityType: z.enum(ENTITY_TYPES),
      entityId: z.string(),
      title,
      content: content.optional(),
      brandingId: z.string().nullable().optional()
    }))
    .mutation(({ ctx, input }) => createReport(ctx.reg, input)),

  update: procedure
    .input(z.object({
      id: z.string(),
      title: title.optional(),
      content: content.optional(),
      brandingId: z.string().nullable().optional()
    }))
    .mutation(({ ctx, input: { id, ...data } }) => updateReport(ctx.reg, id, data)),

  remove: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => removeReport(ctx.reg, input.id))
});
