import { z } from 'zod';
import { router, procedure } from '$shared/trpc/init';
import type { Context } from '$shared/trpc/context.server';
import { SYNC_HOLDERS } from '$shared/utils/file-links';
import type { SyncHolderRef } from '$shared/utils/sync-state';
import { err, ok, type Result } from '$shared/utils/result';
import { gated, startsSync } from '$api/_license';
import { listSyncsNeeded, recordSync } from '$api/_last-sync';
import { getSyncStatus, startSyncNow } from '$api/assist/sync';
import { getSync, saveSyncText, setSyncPrompt, SYNC_PROMPT_LIMIT } from './operations';

const holder = { entityType: z.enum(SYNC_HOLDERS), entityId: z.string().min(1) };

/** moduleGate looks at procedure names, not inputs: a goal in a notebook without goals is refused here. */
const inModel = async <T>(ctx: Pick<Context, 'model'>, ref: SyncHolderRef, run: () => Promise<Result<T>>): Promise<Result<T>> =>
  ctx.model.shows(ref.entityType) ? run() : err(new Error(`This notebook has no ${ref.entityType.toLowerCase()}s.`));

export const syncRouter = router({
  get: procedure
    .meta({ description: "An entity's sync: its prompt (null when it isn't synced), its sync doc (docId; a wiki page's own content is its text), lastSync, syncNeed and its sources (its links marked syncSource)." })
    .input(z.object(holder))
    .query(({ ctx, input }) => inModel(ctx, input, () => getSync(ctx.reg, input))),

  setPrompt: procedure
    .meta({ description: "Syncs a person, group, project, goal or wiki page from its sources: the prompt says what to take from each. A first prompt makes the entity's sync doc (\"<Name> brief\", read-only: only sync.save writes it); on a wiki page, its content becomes the synced text. null clears it, leaving an ordinary doc or page. Mark sources with link.add or link.update --syncSource true." })
    .input(z.object({ ...holder, prompt: z.string().max(SYNC_PROMPT_LIMIT).nullable() }))
    // Starting to sync an entity is Remry Pro; editing or clearing a prompt isn't.
    .mutation(({ ctx, input }) => inModel(ctx, input, async () => {
      const current = await getSync(ctx.reg, input);
      if (!current.ok) return err(current.error);
      const run = (): Promise<Result<{ readonly docId: string | null }>> => setSyncPrompt(ctx.reg, input, input.prompt);
      return startsSync(current.value.prompt, input.prompt) ? gated(ctx, 'sync', run) : run();
    })),

  save: procedure
    .meta({ description: "Writes an entity's synced text (its sync doc's markdown, or a sync page's content), the only way it changes, and records the sync. syncedLinkIds marks those sources synced now, as link.markSynced does." })
    .input(z.object({ ...holder, content: z.string(), syncedLinkIds: z.array(z.string()).optional() }))
    .mutation(({ ctx, input }) => inModel(ctx, input, async () => {
      const saved = await saveSyncText(ctx.reg, input, input.content, (input.syncedLinkIds ?? []).map((id) => ({ id })));
      if (!saved.ok) return err(saved.error);
      await recordSync(ctx.reg, saved.value.entityType, saved.value.id, { by: 'CLAUDE', outcome: 'OK' });
      return ok(saved.value);
    })),

  // Web app only, like chat: "Sync now" (see $api/assist/sync.ts).
  now: procedure
    .input(z.object(holder))
    .mutation(({ ctx, input }) => gated(ctx, 'sync', () => startSyncNow(ctx.reg, ctx.syncRunner, ctx.notebook.id, input))),

  status: procedure
    .input(z.object(holder))
    .query(({ ctx, input }) => getSyncStatus(ctx.syncRunner, ctx.notebook.id, input)),

  // The home page's list of sync docs and pages that want syncing: failed, never synced, or over a week old.
  needed: procedure
    .query(async ({ ctx }) => ok(await listSyncsNeeded(ctx.reg)))
});
