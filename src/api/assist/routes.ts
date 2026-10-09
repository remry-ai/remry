import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { CHAT_LIMITS } from '$shared/assist/claude-cli';
import { sendChat, getChatStatus, getChat, clearChat } from './chat';

const entity = {
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().min(1)
};

// Web app only (hidden from the CLI and MCP in cli/api.ts): from there, Claude
// is already the one reading the notebook.
export const chatRouter = router({
  get: procedure
    .input(z.object(entity))
    .query(({ ctx, input }) => getChat(ctx.reg, ctx.pageChat, ctx.notebook.id, input)),

  send: procedure
    .input(z.object({
      ...entity,
      entityName: z.string().max(500),
      // Longer page text is cut to CHAT_LIMITS.pageText in the prompt.
      pageText: z.string().max(CHAT_LIMITS.pageText * 2),
      content: z.string().trim().min(1).max(CHAT_LIMITS.message)
    }))
    .mutation(({ ctx, input }) => sendChat(ctx.reg, ctx.pageChat, ctx.notebook.id, input)),

  status: procedure
    .input(z.object({ chatId: z.string().min(1) }))
    .query(({ ctx, input }) => getChatStatus(ctx.pageChat, ctx.notebook.id, input.chatId)),

  clear: procedure
    .input(z.object(entity))
    .mutation(({ ctx, input }) => clearChat(ctx.reg, input))
});
