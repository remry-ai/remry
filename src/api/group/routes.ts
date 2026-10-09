import { z } from 'zod';
import { ARCHIVE_FILTERS } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { setArchived } from '$api/_archive';
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  getGroup,
  listGroupMembers,
  listGroups,
  removeGroupMember,
  updateGroup
} from './operations';

// A kind key (TEAM, FAMILY); whether the notebook has it is checked in the operation.
const kind = z.string().max(40);

export const groupRouter = router({
  list: procedure
    .input(z.object({ kind: kind.optional(), archived: z.enum(ARCHIVE_FILTERS).default('exclude') }).default({}))
    .query(({ ctx, input }) => listGroups(ctx.reg, input)),

  get: procedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => getGroup(ctx.reg, input.id)),

  create: procedure
    .input(z.object({
      kind,
      name: z.string().min(1).max(200),
      description: z.string().max(2000).optional()
    }))
    .mutation(({ ctx, input }) => createGroup(ctx.reg, input)),

  update: procedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).nullable().optional(),
      kind: kind.optional()
    }))
    .mutation(({ ctx, input: { id, ...data } }) => updateGroup(ctx.reg, id, data)),

  archive: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => setArchived(ctx.reg, 'GROUP', input.id, true)),

  unarchive: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => setArchived(ctx.reg, 'GROUP', input.id, false)),

  delete: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => deleteGroup(ctx.reg, input.id)),

  listMembers: procedure
    .input(z.object({ groupId: z.string() }))
    .query(({ ctx, input }) => listGroupMembers(ctx.reg, input.groupId)),

  // In an exclusive kind (a department) this replaces the person's other group of that kind.
  addMember: procedure
    .input(z.object({ groupId: z.string(), personId: z.string() }))
    .mutation(({ ctx, input }) => addGroupMember(ctx.reg, input.groupId, input.personId)),

  removeMember: procedure
    .input(z.object({ groupId: z.string(), personId: z.string() }))
    .mutation(({ ctx, input }) => removeGroupMember(ctx.reg, input.groupId, input.personId))
});
