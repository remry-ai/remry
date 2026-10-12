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
    .meta({ description: 'Lists groups (teams, departments, families, friends), optionally of one kind.' })
    .input(z.object({ kind: kind.optional(), archived: z.enum(ARCHIVE_FILTERS).default('exclude') }).default({}))
    .query(({ ctx, input }) => listGroups(ctx.reg, input)),

  get: procedure
    .meta({ description: 'One group with its members.' })
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => getGroup(ctx.reg, input.id)),

  create: procedure
    .meta({ description: 'Creates a group of a kind from groupKind.list. Refuses a name already in use for that kind unless allowDuplicate.' })
    .input(z.object({
      kind,
      name: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      allowDuplicate: z.boolean().optional().describe('Create it even though one with this name exists')
    }))
    .mutation(({ ctx, input }) => createGroup(ctx.reg, input)),

  update: procedure
    .meta({ description: 'Changes a group\'s name, description or kind.' })
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
    .meta({ description: 'A group\'s members.' })
    .input(z.object({ groupId: z.string() }))
    .query(({ ctx, input }) => listGroupMembers(ctx.reg, input.groupId)),

  // In an exclusive kind (a department) this replaces the person's other group of that kind.
  addMember: procedure
    .meta({ description: 'Adds a person to a group (for an exclusive kind, moves them out of their other group of that kind).' })
    .input(z.object({ groupId: z.string(), personId: z.string() }))
    .mutation(({ ctx, input }) => addGroupMember(ctx.reg, input.groupId, input.personId)),

  removeMember: procedure
    .meta({ description: 'Takes a person out of a group.' })
    .input(z.object({ groupId: z.string(), personId: z.string() }))
    .mutation(({ ctx, input }) => removeGroupMember(ctx.reg, input.groupId, input.personId))
});
