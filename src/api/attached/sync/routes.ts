import { z } from 'zod';
import { router, procedure } from '$shared/trpc/init';
import type { Context } from '$shared/trpc/context.server';
import { SYNC_HOLDERS } from '$shared/utils/file-links';
import type { SyncHolderRef } from '$shared/utils/sync-state';
import { err, ok, type Result } from '$shared/utils/result';
import { gated, startsSync } from '$api/_license';
import { listSyncsNeeded, recordSync } from '$api/_last-sync';
import { listSyncEntities } from './list';
import { getSyncStatus, startSyncNow } from '$api/assist/sync';
import { clearSyncError, getSync, requestSync, saveSyncText, setSyncActive, setSyncPrompt, SYNC_DIFF_LIMITS, SYNC_PROMPT_LIMIT, syncDiffNote } from './operations';
import { addNote } from '$api/attached/note/operations';

const holder = { entityType: z.enum(SYNC_HOLDERS), entityId: z.string().min(1) };

/** moduleGate looks at procedure names, not inputs: a goal in a notebook without goals is refused here. */
const inModel = async <T>(ctx: Pick<Context, 'model'>, ref: SyncHolderRef, run: () => Promise<Result<T>>): Promise<Result<T>> =>
  ctx.model.shows(ref.entityType) ? run() : err(new Error(`This notebook has no ${ref.entityType.toLowerCase()}s.`));

export const syncRouter = router({
  get: procedure
    .meta({ description: "An entity's sync: its prompt (null when it isn't synced), whether it's active (false while paused), its sync doc (docId; a wiki page's own content is its text), lastSync, syncNeed and its sources (its links marked syncSource)." })
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

  setActive: procedure
    .meta({ description: "Pauses an entity's sync (active: false) or resumes it (true). Paused, it keeps its prompt, sources and text, but sync.needed leaves it out and sync.save refuses it until it's resumed. Use it when the user wants a sync paused for a while; clearing the prompt (sync.setPrompt --prompt null) ends it instead." })
    .input(z.object({ ...holder, active: z.boolean() }))
    .mutation(({ ctx, input }) => inModel(ctx, input, () => setSyncActive(ctx.reg, input, input.active))),

  save: procedure
    .meta({ description: "Writes an entity's synced text (its sync doc's markdown, or a sync page's content), the only way it changes, and records the sync. Refused while the sync is paused. syncedLinkIds marks those sources synced now, as link.markSynced does. diff: what changed since the last sync, one short line per change (\"Launch 30 Oct → 12 Nov (PRD)\", sources named, not linked): it's added as a \"Sync diff\" note on the entity (noteId in the result). Pass it on every save that changes the text, except the first write-up." })
    .input(z.object({
      ...holder,
      content: z.string(),
      syncedLinkIds: z.array(z.string()).optional(),
      diff: z.array(z.string().max(SYNC_DIFF_LIMITS.line)).max(SYNC_DIFF_LIMITS.lines).optional()
    }))
    .mutation(({ ctx, input }) => inModel(ctx, input, async () => {
      const saved = await saveSyncText(ctx.reg, input, input.content, (input.syncedLinkIds ?? []).map((id) => ({ id })));
      if (!saved.ok) return err(saved.error);
      await recordSync(ctx.reg, saved.value.entityType, saved.value.id, { by: 'CLAUDE', outcome: 'OK' });
      const note = syncDiffNote(input.diff ?? []);
      if (!note) return ok({ ...saved.value, noteId: null as string | null });
      const added = await addNote(ctx.reg, input.entityType, input.entityId, { content: note });
      return added.ok ? ok({ ...saved.value, noteId: added.value.id }) : err(new Error(`Saved the text, but not its sync diff note: ${added.error.message}`));
    })),

  // Web app only, like chat: "Sync now" (see $api/assist/sync.ts).
  now: procedure
    .input(z.object(holder))
    .mutation(({ ctx, input }) => gated(ctx, 'sync', () => startSyncNow(ctx.reg, ctx.syncRunner, ctx.notebook.id, input))),

  status: procedure
    .input(z.object(holder))
    .query(({ ctx, input }) => getSyncStatus(ctx.syncRunner, ctx.notebook.id, input)),

  // "Trigger sync" in the app: the next Claude chat that uses Remry does it (app-only).
  request: procedure
    .input(z.object({ ...holder, requested: z.boolean() }))
    .mutation(({ ctx, input }) => inModel(ctx, input, () => requestSync(ctx.reg, input, input.requested))),

  // The banner's × on a failed sync's error (app-only).
  clearError: procedure
    .input(z.object(holder))
    .mutation(({ ctx, input }) => inModel(ctx, input, () => clearSyncError(ctx.reg, input))),

  // What "run the Remry sync" goes through: every entity kept up to date from outside sources.
  list: procedure
    .meta({ description: "Every unarchived entity with an active sync that has a prompt, to check when the user asks to sync (\"run the Remry sync\", \"sync docs\", a scheduled sync): `sync` (its prompt, docId, lastSync and need) and `links`, its sync sources (with syncedAt and sourceEditedAt). Check every link of every row for edits since its sourceEditedAt, whatever `need` says. Paused syncs and links that aren't sync sources are left out. Empty means the notebook has no active syncs." })
    .query(async ({ ctx }) => ok((await listSyncEntities(ctx.reg)).filter((e) => ctx.model.shows(e.entityType)))),

  // Sync docs and pages that want syncing: Claude's to-do list.
  needed: procedure
    .meta({ description: "Sync docs and pages that want syncing, most pressing first: `requested` (the user asked Claude to sync it in the app: do it now, with your connectors), then the last sync failed, never synced, or over a week old (`stale`). Each has its holder (search.recall it for the prompt and sources; sync.save it), path, need, lastSync and requestedAt. all: true lists every sync doc and page on an unarchived entity, current ones last (need null). Paused syncs are left out. When the user asks to sync, use sync.list instead: it also has entities tracked through their links alone." })
    // A default, not .optional(): an optional object's JSON schema hides its fields from the CLI and MCP.
    .input(z.object({ all: z.boolean().optional() }).default({}))
    .query(async ({ ctx, input }) => ok(await listSyncsNeeded(ctx.reg, input.all ?? false)))
});
