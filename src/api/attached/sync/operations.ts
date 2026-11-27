// Syncing an entity from its sources, for every entity that can be synced (SYNC_HOLDERS), like
// todos for every entity that takes them. A person, group, project or goal is synced into its one
// sync doc (doc.sync_holder, made here when it gets a prompt, never by hand); a wiki page into its
// own content. The prompt and last sync are on that doc or page; the sources are the entity's own
// links marked `syncSource`. The text is written only through `saveSyncText` (Claude's sync.save,
// or the app's Sync now): doc.update and page.update refuse it while it's synced.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable } from '$api/_archive';
import { resolveEntityLabel } from '$api/_entity-labels';
import { requireDocument } from '$api/_body';
import { findSyncTarget, isSyncPaused, loadSyncNeeds, LAST_SYNC_FIELDS, SYNC_PAUSED, syncNeedKey, type SyncTargetRef } from '$api/_last-sync';
import { listLinks, markLinkSynced, type LinkSummary } from '$api/attached/link/operations';
import { updateDoc } from '$api/attached/doc/operations';
import { updatePage } from '$api/page/operations';
import { readLastSync, syncHolderKey, type SyncHolderRef } from '$shared/utils/sync-state';
import type { LastSync, SyncNeed } from '$shared/types/sync-now';

/** The longest prompt kept. */
export const SYNC_PROMPT_LIMIT = 2000;

const TITLE_LIMIT = 200;

export interface SyncView {
  readonly entityType: SyncHolderRef['entityType'];
  readonly entityId: string;
  /** What Claude pulls from each source; null when the entity isn't synced. */
  readonly prompt: string | null;
  /** The entity's sync doc; null for a wiki page (its content is the text) or an entity with no prompt. */
  readonly docId: string | null;
  readonly lastSync: LastSync | null;
  readonly syncNeed: SyncNeed | null;
  /** When the user asked Claude in the app to sync it (sync.request), still waiting; null when not. */
  readonly requestedAt: Date | null;
  /** False while its sync is paused (sync.setActive): the prompt and sources are kept, and nothing syncs it. True when it isn't synced. */
  readonly active: boolean;
  /** Its links marked as sources, newest first. */
  readonly sources: readonly LinkSummary[];
}

const NOT_FOUND = (holder: SyncHolderRef): Error =>
  new Error(`${holder.entityType} ${holder.entityId} not found. Find its id with ${holder.entityType.toLowerCase()}.list or search.query`);

/** The sync doc's title, from the entity's name when it's made: "Checkout brief". */
export const syncDocTitle = (label: string): string => {
  const title = `${label} brief`;
  return title.length <= TITLE_LIMIT ? title : `${label.slice(0, TITLE_LIMIT - 7).trimEnd()}… brief`;
};

/** The entity's prompt, last sync and sources. */
export const getSync = async (reg: Pick<Registry, 'prisma' | 'now'>, holder: SyncHolderRef): Promise<Result<SyncView>> => {
  if ((await resolveEntityLabel(reg, holder.entityType, holder.entityId)) === null) return err(NOT_FOUND(holder));
  const links = await listLinks(reg, holder.entityType, holder.entityId);
  if (!links.ok) return err(links.error);
  const sources = links.value.filter((l) => l.syncSource);
  const target = await findSyncTarget(reg, holder);
  if (!target) return ok({ ...holder, prompt: null, docId: null, lastSync: null, syncNeed: null, requestedAt: null, active: true, sources });
  const row = target.entityType === 'DOC'
    ? await reg.prisma.doc.findUnique({ where: { id: target.id }, select: { prompt: true, ...LAST_SYNC_FIELDS } })
    : await reg.prisma.page.findUnique({ where: { id: target.id }, select: { prompt: true, ...LAST_SYNC_FIELDS } });
  if (!row) return ok({ ...holder, prompt: null, docId: null, lastSync: null, syncNeed: null, requestedAt: null, active: true, sources });
  const lastSync = readLastSync(row);
  const needs = await loadSyncNeeds(reg, [{ ...target, holder, lastSync, requestedAt: row.syncRequestedAt, active: row.syncActive }]);
  return ok({
    ...holder,
    prompt: row.prompt,
    docId: target.entityType === 'DOC' ? target.id : null,
    lastSync,
    syncNeed: needs.get(syncNeedKey(target.entityType, target.id)) ?? null,
    requestedAt: row.syncRequestedAt,
    active: row.syncActive,
    sources
  });
};

const NO_SYNC = { lastSyncAt: null, lastSyncBy: null, lastSyncOutcome: null, lastSyncMessage: null, syncActive: true } as const;

export interface SetPromptResult {
  /** The sync doc (made now on a first prompt); null for a wiki page, or once the prompt is cleared. */
  readonly docId: string | null;
}

/**
 * Sets what the entity is synced with. A first prompt on a person, group, project or goal makes its
 * sync doc, empty, titled "<Name> brief" and first among its docs; on a wiki page it makes the
 * page's content the synced text (a spreadsheet or drawing page is refused). Null or blank clears
 * it: the sync doc stays as an ordinary doc, and the entity's links stop being sources. Editing the
 * prompt of a paused sync keeps it paused.
 */
export const setSyncPrompt = async (
  reg: Pick<Registry, 'prisma'>,
  holder: SyncHolderRef,
  prompt: string | null
): Promise<Result<SetPromptResult>> => {
  const label = await resolveEntityLabel(reg, holder.entityType, holder.entityId);
  if (label === null) return err(NOT_FOUND(holder));
  const writable = await ensureWritable(reg, holder.entityType, holder.entityId);
  if (!writable.ok) return err(writable.error);
  const next = prompt?.trim() || null;
  const clearSources = reg.prisma.link.updateMany({ where: { entityType: holder.entityType, entityId: holder.entityId, syncSource: true }, data: { syncSource: false } });

  if (holder.entityType === 'PAGE') {
    const page = await reg.prisma.page.findUnique({ where: { id: holder.entityId }, select: { bodyType: true } });
    if (!page) return err(NOT_FOUND(holder));
    if (next) {
      const document = requireDocument('page', page.bodyType, 'synced');
      if (!document.ok) return err(document.error);
      await reg.prisma.page.update({ where: { id: holder.entityId }, data: { prompt: next } });
    } else {
      await reg.prisma.$transaction([reg.prisma.page.update({ where: { id: holder.entityId }, data: { prompt: null, ...NO_SYNC } }), clearSources]);
    }
    return ok({ docId: null });
  }

  const key = syncHolderKey(holder);
  const existing = await reg.prisma.doc.findUnique({ where: { syncHolder: key }, select: { id: true } });
  if (!next) {
    if (existing) {
      await reg.prisma.$transaction([reg.prisma.doc.update({ where: { id: existing.id }, data: { prompt: null, syncHolder: null, ...NO_SYNC } }), clearSources]);
    } else {
      await clearSources;
    }
    return ok({ docId: null });
  }
  if (existing) {
    await reg.prisma.doc.update({ where: { id: existing.id }, data: { prompt: next } });
    return ok({ docId: existing.id });
  }
  const first = await reg.prisma.doc.aggregate({ where: { entityType: holder.entityType, entityId: holder.entityId }, _min: { sortOrder: true } });
  const doc = await reg.prisma.doc.create({
    data: {
      entityType: holder.entityType,
      entityId: holder.entityId,
      title: syncDocTitle(label),
      bodyType: 'doc',
      content: '',
      prompt: next,
      syncHolder: key,
      sortOrder: (first._min.sortOrder ?? 1) - 1
    }
  });
  return ok({ docId: doc.id });
};

export interface SyncedSource {
  readonly id: string;
  /** The source's own last-edited time, as read for this sync. */
  readonly editedAt?: Date;
}

/**
 * Writes the entity's synced text: the one way a sync doc's text, or a sync page's content, changes.
 * Marks each of `synced` that is one of the entity's sources as synced now. Recording the sync
 * itself (by what, how it went) is the caller's: Claude's sync.save records one, Sync now records
 * when its job ends. Refused while the sync is paused.
 */
export const saveSyncText = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger' | 'now' | 'uuid'>,
  holder: SyncHolderRef,
  content: string,
  synced: readonly SyncedSource[] = []
): Promise<Result<SyncTargetRef>> => {
  const target = await findSyncTarget(reg, holder);
  if (!target) {
    if ((await resolveEntityLabel(reg, holder.entityType, holder.entityId)) === null) return err(NOT_FOUND(holder));
    return err(new Error('It isn\'t synced: give it a prompt first with sync.setPrompt, then mark its sources with link.add or link.update --syncSource true.'));
  }
  if (await isSyncPaused(reg, target)) return err(new Error(SYNC_PAUSED));
  const saved = target.entityType === 'DOC'
    ? await updateDoc(reg, target.id, { content }, { fromSync: true })
    : await updatePage(reg, target.id, { content }, { fromSync: true });
  if (!saved.ok) return err(saved.error);
  if (synced.length > 0) {
    const sources = await reg.prisma.link.findMany({
      where: { id: { in: synced.map((s) => s.id) }, entityType: holder.entityType, entityId: holder.entityId, syncSource: true },
      select: { id: true }
    });
    const isSource = new Set(sources.map((s) => s.id));
    for (const source of synced) if (isSource.has(source.id)) await markLinkSynced(reg, source.id, source.editedAt);
  }
  return ok(target);
};

/**
 * Asks Claude for a sync (the app's "Trigger sync"), or takes the request back. The app's own
 * assistant reads only with the connectors it has on this computer; a request waits for the next
 * Claude chat that uses Remry (Cowork, Claude desktop), which reads with the user's claude.ai
 * connectors. sync.needed lists it first, as `requested`; a sync that runs clears it.
 */
export const requestSync = async (
  reg: Pick<Registry, 'prisma' | 'now'>,
  holder: SyncHolderRef,
  requested: boolean
): Promise<Result<{ readonly requestedAt: Date | null }>> => {
  const target = await findSyncTarget(reg, holder);
  if (!target) return err(new Error('It isn\'t synced: give it a prompt first.'));
  const writable = await ensureWritable(reg, holder.entityType, holder.entityId);
  if (!writable.ok) return err(writable.error);
  if (requested && await isSyncPaused(reg, target)) return err(new Error(SYNC_PAUSED));
  const requestedAt = requested ? reg.now() : null;
  // Asking for a sync isn't an edit: the row keeps its updatedAt.
  if (target.entityType === 'DOC') {
    const row = await reg.prisma.doc.findUniqueOrThrow({ where: { id: target.id }, select: { updatedAt: true } });
    await reg.prisma.doc.update({ where: { id: target.id }, data: { syncRequestedAt: requestedAt, updatedAt: row.updatedAt } });
  } else {
    const row = await reg.prisma.page.findUniqueOrThrow({ where: { id: target.id }, select: { updatedAt: true } });
    await reg.prisma.page.update({ where: { id: target.id }, data: { syncRequestedAt: requestedAt, updatedAt: row.updatedAt } });
  }
  return ok({ requestedAt });
};

/**
 * Dismisses the last sync's error in the app: its message goes, and the outcome stays FAILED, so
 * the dot stays red until a sync runs. Keeps `updatedAt`. Nothing to do when the last sync didn't fail.
 */
export const clearSyncError = async (reg: Pick<Registry, 'prisma'>, holder: SyncHolderRef): Promise<Result<{ readonly cleared: boolean }>> => {
  const target = await findSyncTarget(reg, holder);
  if (!target) return ok({ cleared: false });
  const where = { id: target.id, lastSyncOutcome: 'FAILED', lastSyncMessage: { not: null } };
  const cleared = target.entityType === 'DOC'
    ? await reg.prisma.doc.findFirst({ where, select: { updatedAt: true } })
    : await reg.prisma.page.findFirst({ where, select: { updatedAt: true } });
  if (!cleared) return ok({ cleared: false });
  if (target.entityType === 'DOC') await reg.prisma.doc.update({ where: { id: target.id }, data: { lastSyncMessage: null, updatedAt: cleared.updatedAt } });
  else await reg.prisma.page.update({ where: { id: target.id }, data: { lastSyncMessage: null, updatedAt: cleared.updatedAt } });
  return ok({ cleared: true });
};

/**
 * Pauses an entity's sync, or resumes it. Paused, it keeps its prompt, sources, text and last
 * sync, but wants no sync (`syncNeed` null, left out of sync.needed), and sync.save, Trigger sync
 * and Sync now refuse it. Pausing takes back a sync the user asked for. Keeps `updatedAt`.
 */
export const setSyncActive = async (
  reg: Pick<Registry, 'prisma'>,
  holder: SyncHolderRef,
  active: boolean
): Promise<Result<{ readonly active: boolean }>> => {
  const target = await findSyncTarget(reg, holder);
  if (!target) {
    if ((await resolveEntityLabel(reg, holder.entityType, holder.entityId)) === null) return err(NOT_FOUND(holder));
    return err(new Error('It isn\'t synced, so there\'s nothing to pause: give it a prompt first with sync.setPrompt.'));
  }
  const writable = await ensureWritable(reg, holder.entityType, holder.entityId);
  if (!writable.ok) return err(writable.error);
  const data = { syncActive: active, ...(!active && { syncRequestedAt: null }) };
  if (target.entityType === 'DOC') {
    const row = await reg.prisma.doc.findUniqueOrThrow({ where: { id: target.id }, select: { updatedAt: true } });
    await reg.prisma.doc.update({ where: { id: target.id }, data: { ...data, updatedAt: row.updatedAt } });
  } else {
    const row = await reg.prisma.page.findUniqueOrThrow({ where: { id: target.id }, select: { updatedAt: true } });
    await reg.prisma.page.update({ where: { id: target.id }, data: { ...data, updatedAt: row.updatedAt } });
  }
  return ok({ active });
};

/** The longest change line, and the most lines, a sync diff note takes. */
export const SYNC_DIFF_LIMITS = { line: 300, lines: 30 } as const;

/** A sync diff note's text: "Sync diff", then a bullet per change (a leading "- " is dropped, blanks skipped). */
export const syncDiffNote = (changes: readonly string[]): string | null => {
  const lines = changes.map((c) => c.trim().replace(/^[-*•]\s+/, '').trim()).filter((c) => c.length > 0);
  return lines.length > 0 ? ['Sync diff', ...lines.map((l) => `- ${l}`)].join('\n') : null;
};
