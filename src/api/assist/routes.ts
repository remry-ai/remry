import { z } from 'zod';
import { ENTITY_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { gated } from '$api/_license';
import { ASK_LIMITS, CHAT_LIMITS } from '$shared/assist/claude-cli';
import { askNotebook } from './ask';
import { sendChat, getChatStatus, getChat, clearChat } from './chat';
import { getSyncStatus, startSyncNow } from './sync';
import { listSyncsNeeded } from '$api/_last-sync';
import { llmChoiceStatus, saveLlm } from '$shared/assist/llm-choice.server';
import { LLM_PROVIDER_IDS } from '$shared/types/llm';
import { ok } from '$shared/utils/result';

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

  // The ⌘K finder's /ask: one answer about the whole notebook, from full-text search (Pro).
  ask: procedure
    .input(z.object({ question: z.string().trim().min(1).max(ASK_LIMITS.question) }))
    .mutation(({ ctx, input }) => gated(ctx, 'search', () => askNotebook(ctx.reg, ctx.pageChat, ctx.notebook.id, input.question))),

  clear: procedure
    .input(z.object(entity))
    .mutation(({ ctx, input }) => clearChat(ctx.reg, input))
});

const syncTarget = { entityType: z.enum(['DOC', 'PAGE']), id: z.string().min(1) };

// Web app only, like chat: a sync doc's or page's "Sync now" (see sync.ts).
export const syncRouter = router({
  now: procedure
    .input(z.object(syncTarget))
    .mutation(({ ctx, input }) => startSyncNow(ctx.reg, ctx.syncRunner, ctx.notebook.id, input.entityType, input.id)),

  status: procedure
    .input(z.object(syncTarget))
    .query(({ ctx, input }) => getSyncStatus(ctx.syncRunner, ctx.notebook.id, input.entityType, input.id)),

  // The home page's list of sync docs and pages that want syncing: failed, never synced, or over a week old.
  needed: procedure
    .query(async ({ ctx }) => ok(await listSyncsNeeded(ctx.reg)))
});

// The default assistant the web app runs, for the whole computer (settings.json). Web app only.
export const llmRouter = router({
  available: procedure
    .meta({ description: 'The AI assistants the web app can run, whether each is installed, and the default.' })
    .query(async () => ok(await llmChoiceStatus())),

  setDefault: procedure
    .meta({ description: 'Sets the AI assistant the web app runs.' })
    .input(z.object({ provider: z.enum(LLM_PROVIDER_IDS) }))
    .mutation(({ input }) => saveLlm(input.provider))
});
