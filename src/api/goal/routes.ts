import { z } from 'zod';
import { ARCHIVE_FILTERS, GOAL_STATUSES, OWNER_TYPES } from '$shared/types/enums';
import { GOAL_PERIOD_PATTERN } from '$shared/types/goals';
import { router, procedure } from '$shared/trpc/init';
import { setArchived } from '$api/_archive';
import {
  addCheckIn,
  addGoalProject,
  createGoal,
  deleteGoal,
  getGoal,
  listGoals,
  removeCheckIn,
  removeGoalProject,
  updateGoal
} from './operations';

const period = z.string().regex(GOAL_PERIOD_PATTERN, 'must look like 2026, 2026-H2 or 2026-Q3');
const status = z.enum(GOAL_STATUSES);
const goalProject = z.object({ goalId: z.string(), projectId: z.string() });

export const goalRouter = router({
  list: procedure
    .meta({ description: 'Lists goals, filtered by owner, period, status, parent goal or linked project.' })
    .input(z.object({
      ownerType: z.enum(OWNER_TYPES).optional(),
      ownerId: z.string().optional(),
      period: z.string().optional(),
      status: status.optional(),
      parentId: z.string().nullable().optional(),
      projectId: z.string().optional(),
      archived: z.enum(ARCHIVE_FILTERS).default('exclude')
    }).default({}))
    .query(({ ctx, input }) => listGoals(ctx.reg, input)),

  get: procedure
    .meta({ description: 'One goal with its check-ins, sub-goals and linked projects.' })
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => getGoal(ctx.reg, input.id)),

  create: procedure
    .meta({ description: 'Creates a goal with an owner, a period (2026-H2, 2026-Q3, 2026), and optionally a unit, baseline and target.' })
    .input(z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(5000).optional(),
      ownerType: z.enum(OWNER_TYPES).optional(),
      ownerId: z.string().optional(),
      parentId: z.string().optional(),
      period: period.optional(),
      status: status.optional(),
      unit: z.string().max(30).optional(),
      baseline: z.number().optional(),
      target: z.number().optional()
    }))
    .mutation(({ ctx, input }) => createGoal(ctx.reg, input)),

  update: procedure
    .meta({ description: 'Changes a goal\'s fields. null clears one.' })
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).nullable().optional(),
      ownerType: z.enum(OWNER_TYPES).nullable().optional(),
      ownerId: z.string().nullable().optional(),
      parentId: z.string().nullable().optional(),
      period: period.nullable().optional(),
      status: status.optional(),
      unit: z.string().max(30).nullable().optional(),
      baseline: z.number().nullable().optional(),
      target: z.number().nullable().optional()
    }))
    .mutation(({ ctx, input: { id, ...data } }) => updateGoal(ctx.reg, id, data)),

  archive: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => setArchived(ctx.reg, 'GOAL', input.id, true)),

  unarchive: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => setArchived(ctx.reg, 'GOAL', input.id, false)),

  delete: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => deleteGoal(ctx.reg, input.id)),

  checkIn: procedure
    .meta({ description: 'Records a goal\'s progress on a date: a value, a status and a comment.' })
    .input(z.object({
      goalId: z.string(),
      date: z.coerce.date().optional(),
      value: z.number().optional(),
      status: status.optional(),
      comment: z.string().max(2000).optional()
    }))
    .mutation(({ ctx, input }) => addCheckIn(ctx.reg, input)),

  removeCheckIn: procedure
    .meta({ description: 'Deletes one check-in.' })
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => removeCheckIn(ctx.reg, input.id)),

  addProject: procedure
    .meta({ description: 'Links a project to a goal it contributes to.' })
    .input(goalProject)
    .mutation(({ ctx, input }) => addGoalProject(ctx.reg, input.goalId, input.projectId)),

  removeProject: procedure
    .meta({ description: 'Unlinks a project from a goal.' })
    .input(goalProject)
    .mutation(({ ctx, input }) => removeGoalProject(ctx.reg, input.goalId, input.projectId))
});
