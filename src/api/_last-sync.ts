// A sync doc's or page's last sync: saved when the app's Sync now finishes (or fails) and when
// Claude marks one of its sources synced, so the banner can say when it ran, by what and how it
// went; and which sync docs and pages want syncing, for the home page and a docs list.

import type { Registry } from '$shared/registry';
import type { EntityType, SyncOutcome, SyncRunnerKind } from '$shared/types/enums';
import type { LastSync, SyncNeed } from '$shared/types/sync-now';
import { fileLinkKey } from '$shared/utils/file-links';
import { readLastSync, syncNeed, type LastSyncColumns } from '$shared/utils/sync-state';
import { docPath, entityPath } from '$shared/utils/entity';
import { isArchivedRef, loadArchivedIds } from './_archive';
import { resolveEntityLabels } from './_entity-labels';

export type SyncTarget = 'DOC' | 'PAGE';

export interface SyncRecord {
  readonly by: SyncRunnerKind;
  readonly outcome: SyncOutcome;
  readonly message?: string | null;
}

/** The fields to select for `readLastSync`. */
export const LAST_SYNC_FIELDS = { lastSyncAt: true, lastSyncBy: true, lastSyncOutcome: true, lastSyncMessage: true } as const;

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
  const data = { lastSyncAt: reg.now(), lastSyncBy: sync.by, lastSyncOutcome: sync.outcome, lastSyncMessage: sync.message ?? null };
  if (entityType === 'DOC') {
    const row = await reg.prisma.doc.findUnique({ where: { id }, select: { updatedAt: true } });
    if (row) await reg.prisma.doc.update({ where: { id }, data: { ...data, updatedAt: row.updatedAt } });
    return;
  }
  const row = await reg.prisma.page.findUnique({ where: { id }, select: { updatedAt: true } });
  if (row) await reg.prisma.page.update({ where: { id }, data: { ...data, updatedAt: row.updatedAt } });
};

/** Claude marked a source synced (link.markSynced, link.add --synced): on a sync doc or page, that's a sync. */
export const recordClaudeSync = async (
  reg: Pick<Registry, 'prisma' | 'now'>,
  entityType: EntityType,
  entityId: string
): Promise<void> => {
  if (entityType !== 'DOC' && entityType !== 'PAGE') return;
  const row = entityType === 'DOC'
    ? await reg.prisma.doc.findUnique({ where: { id: entityId }, select: { prompt: true } })
    : await reg.prisma.page.findUnique({ where: { id: entityId }, select: { prompt: true } });
  if (row?.prompt) await recordSync(reg, entityType, entityId, { by: 'CLAUDE', outcome: 'OK' });
};

export interface SyncNeedTarget {
  readonly entityType: SyncTarget;
  readonly id: string;
  readonly lastSync: LastSync | null;
}

const targetKey = (entityType: string, id: string): string => `${entityType}:${id}`;

/** Why each sync doc or page wants syncing (null when it doesn't), keyed `<DOC|PAGE>:<id>`; one link query. */
export const loadSyncNeeds = async (
  reg: Pick<Registry, 'prisma' | 'now'>,
  targets: readonly SyncNeedTarget[]
): Promise<ReadonlyMap<string, SyncNeed | null>> => {
  if (targets.length === 0) return new Map();
  const links = await reg.prisma.link.findMany({
    where: { OR: (['DOC', 'PAGE'] as const).flatMap((type) => {
      const ids = targets.filter((t) => t.entityType === type).map((t) => t.id);
      return ids.length > 0 ? [{ entityType: type, entityId: { in: ids } }] : [];
    }) },
    select: { entityType: true, entityId: true, url: true }
  });
  const sources = new Map<string, { readonly isFile: boolean }[]>();
  for (const link of links) {
    const key = targetKey(link.entityType, link.entityId);
    sources.set(key, [...(sources.get(key) ?? []), { isFile: fileLinkKey(link.url) !== null }]);
  }
  const now = reg.now();
  return new Map(targets.map((t) => {
    const key = targetKey(t.entityType, t.id);
    return [key, syncNeed(t.lastSync, sources.get(key) ?? [], now)];
  }));
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
  readonly need: SyncNeed;
  readonly lastSync: LastSync | null;
}

const NEED_ORDER: Readonly<Record<SyncNeed, number>> = { failed: 0, never: 1, stale: 2 };

/**
 * Every sync doc and page that wants syncing, failed ones first, then never synced, then the
 * longest since a sync. Leaves out archived pages, docs on archived entities, and spreadsheets.
 */
export const listSyncsNeeded = async (reg: Pick<Registry, 'prisma' | 'now'>): Promise<readonly SyncNeeded[]> => {
  const [docs, pages, archived] = await Promise.all([
    reg.prisma.doc.findMany({ where: { prompt: { not: null } }, select: { id: true, title: true, entityType: true, entityId: true, ...LAST_SYNC_FIELDS } }),
    reg.prisma.page.findMany({ where: { prompt: { not: null }, archivedAt: null, bodyType: 'doc' }, select: { id: true, title: true, ...LAST_SYNC_FIELDS } }),
    loadArchivedIds(reg)
  ]);
  const activeDocs = docs.filter((d) => !isArchivedRef(archived, d.entityType, d.entityId));
  const targets = [
    ...activeDocs.map((d) => ({ entityType: 'DOC' as const, id: d.id, lastSync: readLastSync(d) })),
    ...pages.map((p) => ({ entityType: 'PAGE' as const, id: p.id, lastSync: readLastSync(p) }))
  ];
  const needs = await loadSyncNeeds(reg, targets);
  const labels = await resolveEntityLabels(reg, activeDocs.map((d) => ({ entityType: d.entityType as EntityType, entityId: d.entityId })));
  const docById = new Map(activeDocs.map((d) => [d.id, d]));
  const pageById = new Map(pages.map((p) => [p.id, p]));

  const rows = targets.flatMap((t): SyncNeeded[] => {
    const need = needs.get(targetKey(t.entityType, t.id));
    if (!need) return [];
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
        need,
        lastSync: t.lastSync
      }];
    }
    const page = pageById.get(t.id);
    return page ? [{ entityType: 'PAGE' as const, id: page.id, title: page.title, path: entityPath('PAGE', page.id), on: null, need, lastSync: t.lastSync }] : [];
  });
  return rows.sort((a, b) =>
    NEED_ORDER[a.need] - NEED_ORDER[b.need]
    || (a.lastSync?.at.getTime() ?? 0) - (b.lastSync?.at.getTime() ?? 0)
    || a.title.localeCompare(b.title));
};
