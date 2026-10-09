import { z } from 'zod';
import { router, procedure } from '$shared/trpc/init';
import { gated } from '$api/_license';
import { ENTITY_TYPES, RELATABLE_TYPES } from '$shared/types/enums';
import { SEARCH_TYPES } from '$shared/types/search';
import { searchNotebook, SEARCH_LIMITS } from './operations';
import { recallEntity, RECALL_LIMITS } from './recall';

// Full-text search and recall are Remry Pro (src/api/_license.ts).
export const searchRouter = router({
  query: procedure
    .input(z.object({
      q: z.string().min(1).max(SEARCH_LIMITS.query)
        .describe('Words to find (all must match; each also matches as a prefix). "exact phrase", a OR b, -exclude'),
      types: z.array(z.enum(SEARCH_TYPES)).optional(),
      within: z.object({ entityType: z.enum(ENTITY_TYPES), entityId: z.string().min(1) }).optional()
        .describe('Only this entity and what is attached to it (its notes, docs, todos, comments, links)'),
      includeArchived: z.boolean().optional().describe('Also search archived entities and what is attached to them'),
      limit: z.number().int().min(1).max(SEARCH_LIMITS.results).optional()
    }))
    .query(({ ctx, input }) => gated(ctx, 'search', () => searchNotebook(ctx.reg, input))),

  recall: procedure
    .input(z.object({
      entityType: z.enum(RELATABLE_TYPES),
      entityId: z.string().min(1),
      limit: z.number().int().min(1).max(RECALL_LIMITS.maxItems).optional()
    }))
    .query(({ ctx, input }) => gated(ctx, 'search', () => recallEntity(ctx.reg, input.entityType, input.entityId, input.limit)))
});
