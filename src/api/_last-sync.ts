// A sync doc's or page's last sync: saved when the app's Sync now finishes (or fails) and when
// Claude marks one of its entity's sources synced, so the banner can say when it ran, by what and
// how it went; and which sync docs and pages want syncing, for a docs list and Claude's sync.needed.
// A sync doc's sources are its entity's links marked `syncSource`; a sync page's, its own.

import type { Registry } from '$shared/registry';
import type { EntityType, SyncOutcome, SyncRunnerKind } from '$shared/types/enums';
import type { LastSync, SyncNeed } from '$shared/types/sync-now';
import { fileLinkKey, isSyncHolder } from '$shared/utils/file-links';
import { readLastSync, syncHolderKey, syncNeed, type LastSyncColumns, type SyncHolderRef } from '$shared/utils/sync-state';
import { docPath, entityPath } from '$shared/utils/entity';
import { isArchivedRef, loadArchivedIds } from './_archive';
import { resolveEntityLabels } from './_entity-labels';

/** The row a sync writes: the entity's sync doc, or the sync page itself. */
export type SyncTarget = 'DOC' | 'PAGE';

export interface SyncTargetRef {
  readonly entityType: SyncTarget;
  readonly id: string;
}

/** The entity's sync doc, or the page itself when it's a sync page; null when it has no prompt. */
export const findSyncTarget = async (reg: Pick<Registry, 'prisma'>, holder: SyncHolderRef): Promise<SyncTargetRef | null> => {
  if (holder.entityType === 'PAGE') {
    const page = await reg.prisma.page.findUnique({ where: { id: holder.entityId }, select: { prompt: true } });
    return page?.prompt ? { entityType: 'PAGE', id: holder.entityId } : null;
  }
  const doc = await reg.prisma.doc.findUnique({ where: { syncHolder: syncHolderKey(holder) }, select: { id: true } });
  return doc ? { entityType: 'DOC', id: doc.id } : null;
};

export interface SyncRecord {
  readonly by: SyncRunnerKind;
  readonly outcome: SyncOutcome;
  readonly message?: string | null;
}

/** The fields to select for `readLastSync`. */
export const LAST_SYNC_FIELDS = { lastSyncAt: true, lastSyncBy: true, lastSyncOutcome: true, lastSyncMessage: true, syncRequestedAt: true } as const;

/** The last-sync columns to copy when a sync doc becomes a sync page, or back (entity.convert). */
export const lastSyncColumnsOf = (row: LastSyncColumns): LastSyncColumns => ({
  lastSyncAt: row.lastSyncAt,
  lastSyncBy: row.lastSyncBy,
  lastSyncOutcome: row.lastSyncOutcome,
  lastSyncMessage: row.lastSyncMessage
});

/**
 * Saves the doc's or page's last sync, keeping its `updatedAt`: a sync that saved text has already
 * moved it, and a failed one changed nothing the user wrote. Does nothing when it's gone.
 */
export const recordSync = async (
  reg: Pick<Registry, 'prisma' | 'now'>,
  entityType: SyncTarget,
  id: string,
  sync: SyncRecord
): Promise<void> => {
  // A sync that ran answers a request for one; a failed one leaves it for the next Claude to try.
  const data = {
    lastSyncAt: reg.now(), lastSyncBy: sync.by, lastSyncOutcome: sync.outcome, lastSyncMessage: sync.message ?? null,
    ...(sync.outcome !== 'FAILED' && { syncRequestedAt: null })
  };
  if (entityType === 'DOC') {
    const row = await reg.prisma.doc.findUnique({ where: { id }, select: { updatedAt: true } });
    if (row) await reg.prisma.doc.update({ where: { id }, data: { ...data, updatedAt: row.updatedAt } });
    return;
  }
  const row = await reg.prisma.page.findUnique({ where: { id }, select: { updatedAt: true } });
  if (row) await reg.prisma.page.update({ where: { id }, data: { ...data, updatedAt: row.updatedAt } });
};

/**
 * Claude marked a link synced (link.markSynced, link.add --synced): when it's a sync source of an
 * entity with a sync doc or page, that's a sync of it.
 */
export const recordClaudeSync = async (reg: Pick<Registry, 'prisma' | 'now'>, linkId: string): Promise<void> => {
  const link = await reg.prisma.link.findUnique({ where: { id: linkId }, select: { entityType: true, entityId: true, syncSource: true } });
  if (!link?.syncSource || !isSyncHolder(link.entityType)) return;
  const target = await findSyncTarget(reg, { entityType: link.entityType, entityId: link.entityId });
  if (target) await recordSync(reg, target.entityType, target.id, { by: 'CLAUDE', outcome: 'OK' });
};

export interface SyncNeedTarget {
  readonly entityType: SyncTarget;
  readonly id: string;
  /** Whose sources it's written from: the doc's entity, or the page itself. */
  readonly holder: SyncHolderRef;
  readonly lastSync: LastSync | null;
  /** When the user asked for a sync in the app, still waiting; null when not. */
  readonly requestedAt?: Date | null;
}

const targetKey = (entityType: string, id: string): string => `${entityType}:${id}`;

/** Why each sync doc or page wants syncing (null when it doesn't), keyed `<DOC|PAGE>:<id>`; one link query. */
export const loadSyncNeeds = async (
  reg: Pick<Registry, 'prisma' | 'now'>,
  targets: readonly SyncNeedTarget[]
): Promise<ReadonlyMap<string, SyncNeed | null>> => {
  if (targets.length === 0) return new Map();
  const byType = new Map<string, string[]>();
  for (const t of targets) byType.set(t.holder.entityType, [...(byType.get(t.holder.entityType) ?? []), t.holder.entityId]);
  const links = await reg.prisma.link.findMany({
    where: { syncSource: true, OR: [...byType].map(([entityType, ids]) => ({ entityType, entityId: { in: ids } })) },
    select: { entityType: true, entityId: true, url: true }
  });
  const sources = new Map<string, { readonly isFile: boolean }[]>();
  for (const link of links) {
    const key = targetKey(link.entityType, link.entityId);
    sources.set(key, [...(sources.get(key) ?? []), { isFile: fileLinkKey(link.url) !== null }]);
  }
  const now = reg.now();
  return new Map(targets.map((t) => [
    targetKey(t.entityType, t.id),
    syncNeed(t.lastSync, sources.get(targetKey(t.holder.entityType, t.holder.entityId)) ?? [], now, t.requestedAt ?? null)
  ]));
};

export const syncNeedKey = targetKey;

export interface SyncNeeded {
  readonly entityType: SyncTarget;
  readonly id: string;
  readonly title: string;
  /** The doc open on its entity's page, or the wiki page. */
  readonly path: string;
  /** What a doc is on: its entity's name and page. Null for a wiki page, or a doc whose entity is gone. */
  readonly on: { readonly label: string; readonly path: string } | null;
  /** The synced entity, for sync.get and sync.save: the doc's entity, or the page. */
  readonly holder: SyncHolderRef;
  /** Null only with `all`: synced and current. */
  readonly need: SyncNeed | null;
  readonly lastSync: LastSync | null;
  /** When the user asked for this sync in the app; null when they didn't. */
  readonly requestedAt: Date | null;
}

const NEED_ORDER: Readonly<Record<SyncNeed, number>> = { requested: 0, failed: 1, never: 2, stale: 3 };
const needOrder = (need: SyncNeed | null): number => need ? NEED_ORDER[need] : 4;

/**
 * Every sync doc and page that wants syncing: ones the user asked for first, then failed, then
 * never synced, then the longest since a sync. Leaves out archived pages, docs on archived entities, and spreadsheets.
 * `all` also lists the ones that are current (need null), last: every sync doc and page to refresh.
 */
export const listSyncsNeeded = async (reg: Pick<Registry, 'prisma' | 'now'>, all = false): Promise<readonly SyncNeeded[]> => {
  const [docs, pages, archived] = await Promise.all([
    reg.prisma.doc.findMany({ where: { syncHolder: { not: null }, bodyType: 'doc' }, select: { id: true, title: true, entityType: true, entityId: true, ...LAST_SYNC_FIELDS } }),
    reg.prisma.page.findMany({ where: { prompt: { not: null }, archivedAt: null, bodyType: 'doc' }, select: { id: true, title: true, ...LAST_SYNC_FIELDS } }),
    loadArchivedIds(reg)
  ]);
  const activeDocs = docs.filter((d) => !isArchivedRef(archived, d.entityType, d.entityId));
  const targets: SyncNeedTarget[] = [
    ...activeDocs.flatMap((d) => isSyncHolder(d.entityType)
      ? [{ entityType: 'DOC' as const, id: d.id, holder: { entityType: d.entityType, entityId: d.entityId }, lastSync: readLastSync(d), requestedAt: d.syncRequestedAt }]
      : []),
    ...pages.map((p) => ({ entityType: 'PAGE' as const, id: p.id, holder: { entityType: 'PAGE' as const, entityId: p.id }, lastSync: readLastSync(p), requestedAt: p.syncRequestedAt }))
  ];
  const needs = await loadSyncNeeds(reg, targets);
  const labels = await resolveEntityLabels(reg, activeDocs.map((d) => ({ entityType: d.entityType as EntityType, entityId: d.entityId })));
  const docById = new Map(activeDocs.map((d) => [d.id, d]));
  const pageById = new Map(pages.map((p) => [p.id, p]));

  const rows = targets.flatMap((t): SyncNeeded[] => {
    const need = needs.get(targetKey(t.entityType, t.id)) ?? null;
    if (!need && !all) return [];
    const doc = t.entityType === 'DOC' ? docById.get(t.id) : undefined;
    if (doc) {
      const holderType = doc.entityType as EntityType;
      const label = labels.labelOf(holderType, doc.entityId);
      return [{
        entityType: 'DOC' as const,
        id: doc.id,
        title: doc.title,
        path: docPath(holderType, doc.entityId, doc.id),
        on: label ? { label, path: entityPath(holderType, doc.entityId) } : null,
        holder: t.holder,
        need,
        lastSync: t.lastSync,
        requestedAt: t.requestedAt ?? null
      }];
    }
    const page = pageById.get(t.id);
    return page
      ? [{ entityType: 'PAGE' as const, id: page.id, title: page.title, path: entityPath('PAGE', page.id), on: null, holder: t.holder, need, lastSync: t.lastSync, requestedAt: t.requestedAt ?? null }]
      : [];
  });
  return rows.sort((a, b) =>
    needOrder(a.need) - needOrder(b.need)
    || (a.lastSync?.at.getTime() ?? 0) - (b.lastSync?.at.getTime() ?? 0)
    || a.title.localeCompare(b.title));
};
