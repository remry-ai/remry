import { z } from 'zod';
import { router, procedure } from '$shared/trpc/init';
import { FOCUS_TYPES, HOME_TODO_SORTS } from '$shared/types/home';
import { listOpenTodos, listRecentUpdates } from './operations';
import { getFocusGraph } from './focus-graph';

export const homeRouter = router({
  todos: procedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).optional(),
      // How many to skip, for the next page; `total` in the result says how many are open.
      offset: z.number().int().min(0).optional(),
      sort: z.enum(HOME_TODO_SORTS).optional()
    }))
    .query(({ ctx, input }) => listOpenTodos(ctx.reg, input.limit, input.sort, input.offset)),

  updates: procedure
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }))
    .query(({ ctx, input }) => listRecentUpdates(ctx.reg, input.limit)),

  graph: procedure
    .input(z.object({
      focusType: z.enum(FOCUS_TYPES).optional(),
      focusId: z.string().min(1).optional()
    }).default({}))
    .query(({ ctx, input }) =>
      getFocusGraph(ctx.reg, ctx.model, input.focusType && input.focusId ? { type: input.focusType, id: input.focusId } : undefined)
    )
});
