import { z } from 'zod';
import { ARCHIVE_FILTERS, OWNER_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { setArchived } from '$api/_archive';
import { listProjects, getProject, createProject, updateProject, deleteProject } from './operations';
import { listProjectDependencies } from './dependencies';

export const projectRouter = router({
  list: procedure
    .input(z.object({
      ownerType: z.enum(OWNER_TYPES).optional(),
      ownerId: z.string().optional(),
      archived: z.enum(ARCHIVE_FILTERS).default('exclude')
    }).default({}))
    .query(({ ctx, input }) => listProjects(ctx.reg, input)),

  dependencies: procedure
    .input(z.object({ archived: z.enum(ARCHIVE_FILTERS).default('exclude') }).default({}))
    .query(({ ctx, input }) => listProjectDependencies(ctx.reg, input.archived)),

  get: procedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => getProject(ctx.reg, input.id)),

  create: procedure
    .input(z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(5000).optional(),
      status: z.string().max(50).optional().describe('proposed, committed, in-progress, blocked, done or abandoned; words like active or planning map onto these'),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
      daysOptimistic: z.number().int().min(0).optional(),
      daysLikely: z.number().int().min(0).optional(),
      daysPessimistic: z.number().int().min(0).optional(),
      parentId: z.string().optional(),
      ownerType: z.enum(OWNER_TYPES).optional(),
      ownerId: z.string().optional()
    }))
    .mutation(({ ctx, input }) => createProject(ctx.reg, input)),

  update: procedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).nullable().optional(),
      status: z.string().max(50).nullable().optional().describe('proposed, committed, in-progress, blocked, done or abandoned; words like active or planning map onto these'),
      startDate: z.coerce.date().nullable().optional(),
      endDate: z.coerce.date().nullable().optional(),
      daysOptimistic: z.number().int().min(0).nullable().optional(),
      daysLikely: z.number().int().min(0).nullable().optional(),
      daysPessimistic: z.number().int().min(0).nullable().optional(),
      parentId: z.string().nullable().optional(),
      ownerType: z.enum(OWNER_TYPES).nullable().optional(),
      ownerId: z.string().nullable().optional()
    }))
    .mutation(({ ctx, input: { id, ...data } }) => updateProject(ctx.reg, id, data)),

  archive: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => setArchived(ctx.reg, 'PROJECT', input.id, true)),

  unarchive: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => setArchived(ctx.reg, 'PROJECT', input.id, false)),

  delete: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => deleteProject(ctx.reg, input.id)),
});
