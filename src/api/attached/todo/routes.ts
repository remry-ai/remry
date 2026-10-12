import { z } from 'zod';
import { ARCHIVE_FILTERS, ENTITY_TYPES, TODO_RECURRENCES, TODO_STATUSES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { listTodos, listTodosForEntity, createTodo, updateTodo, deleteTodo } from './operations';

const entityTypeEnum = z.enum(ENTITY_TYPES);
const todoStatusEnum = z.enum(TODO_STATUSES);

export const todoRouter = router({
  list: procedure
    .meta({ description: 'Lists todos across the notebook, filtered by status or by the type of entity they hang on.' })
    .input(z.object({
      status: todoStatusEnum.optional(),
      entityType: entityTypeEnum.optional(),
      archived: z.enum(ARCHIVE_FILTERS).default('exclude')
    }))
    .query(({ ctx, input }) => listTodos(ctx.reg, input)),

  forEntity: procedure
    .meta({ description: 'One entity\'s todos.' })
    .input(z.object({
      entityType: entityTypeEnum,
      entityId: z.string()
    }))
    .query(({ ctx, input }) => listTodosForEntity(ctx.reg, input.entityType, input.entityId)),

  create: procedure
    .meta({ description: 'Creates a todo on an entity, with a priority 0-3, a target date and an optional recurrence.' })
    .input(z.object({
      title: z.string().min(1).max(500),
      description: z.string().max(5000).optional(),
      priority: z.number().int().min(0).max(3).optional(),
      entityType: entityTypeEnum,
      entityId: z.string(),
      targetDate: z.coerce.date().optional(),
      // Completing the todo creates the next one, due one interval after targetDate.
      recurrence: z.enum(TODO_RECURRENCES).nullable().optional()
    }))
    .mutation(({ ctx, input }) => createTodo(ctx.reg, input)),

  update: procedure
    .meta({ description: 'Changes a todo; status COMPLETE marks it done (a recurring todo then creates the next one).' })
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(5000).nullable().optional(),
      status: todoStatusEnum.optional(),
      priority: z.number().int().min(0).max(3).optional(),
      targetDate: z.coerce.date().nullable().optional(),
      recurrence: z.enum(TODO_RECURRENCES).nullable().optional()
    }))
    .mutation(({ ctx, input }) => updateTodo(ctx.reg, input.id, input)),

  delete: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => deleteTodo(ctx.reg, input.id))
});
