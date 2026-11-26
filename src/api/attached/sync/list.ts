// Every unarchived entity Claude keeps up to date from outside sources, for a "run the Remry sync":
// one with an active sync (a sync doc, or a sync page) and one whose links are tracked (synced
// from a source, `syncedAt`, or marked a sync source), each with those links. sync.needed lists
// only sync docs and pages that have a prompt, so a notebook kept current through tracked links
// alone came back empty there. A paused sync is left out, links and all.

import type { Registry } from '$shared/registry';
import type { EntityType } from '$shared/types/enums';
import type { LastSync, SyncNeed } from '$shared/types/sync-now';
import { isSyncHolder } from '$shared/utils/file-links';
import { readLastSync } from '$shared/utils/sync-state';
import { docPath, entityPath } from '$shared/utils/entity';
import { isArchivedRef, loadArchivedIds } from '$api/_archive';
import { resolveEntityLabels } from '$api/_entity-labels';
import { LAST_SYNC_FIELDS, loadSyncNeeds, syncNeedKey, type SyncNeedTarget } from '$api/_last-sync';

export interface TrackedLink {
  readonly id: string;
  readonly url: string;
  readonly title: string | null;
  /** When the entity was last brought up to date from it; null for a sync source not synced yet. */
  readonly syncedAt: Date | null;
  /** The source's own last-edited time at that sync: a later one at the source means it changed. */
  readonly sourceEditedAt: Date | null;
  /** One of the entity's sync sources, which its sync doc or page is written from. */
  readonly syncSource: boolean;
}

export interface SyncEntity {
  /** The entity the links are on: a person, group, project, goal or wiki page, or a doc. */
  readonly entityType: EntityType;
  readonly entityId: string;
  /** Its name; a doc's title. */
  readonly label: string;
  readonly path: string;
  /** Its active sync (a sync doc, or the page's own content), or null when it only has tracked links. */
  readonly sync: {
    readonly docId: string | null;
    readonly prompt: string;
    readonly lastSync: LastSync | null;
    /** Why it's due (null when it isn't): its sources still have to be checked either way. */
    readonly need: SyncNeed | null;
  } | null;
  /** Its tracked links: those synced from a source, and its sync sources. Oldest first. */
  readonly links: readonly TrackedLink[];
}

const key = (entityType: string, entityId: string): string => `${entityType}:${entityId}`;

interface Row {
  readonly entityType: EntityType;
  readonly entityId: string;
  path: string;
  label: string | null;
  sync: SyncEntity['sync'];
  target: SyncNeedTarget | null;
  readonly links: TrackedLink[];
}

/** Every unarchived entity with an active sync or tracked links: synced ones first, then by name. */
export const listSyncEntities = async (reg: Pick<Registry, 'prisma' | 'now'>): Promise<readonly SyncEntity[]> => {
  const [docs, pages, links, archived] = await Promise.all([
    reg.prisma.doc.findMany({ where: { syncHolder: { not: null }, bodyType: 'doc' }, select: { id: true, entityType: true, entityId: true, prompt: true, ...LAST_SYNC_FIELDS } }),
    reg.prisma.page.findMany({ where: { prompt: { not: null }, archivedAt: null, bodyType: 'doc' }, select: { id: true, prompt: true, ...LAST_SYNC_FIELDS } }),
    reg.prisma.link.findMany({
      where: { OR: [{ syncedAt: { not: null } }, { syncSource: true }] },
      orderBy: { createdAt: 'asc' },
      select: { id: true, entityType: true, entityId: true, url: true, title: true, syncedAt: true, sourceEditedAt: true, syncSource: true }
    }),
    loadArchivedIds(reg)
  ]);

  // Paused syncs are left out, with their links.
  const paused = new Set([
    ...docs.filter((d) => !d.syncActive).map((d) => key(d.entityType, d.entityId)),
    ...pages.filter((p) => !p.syncActive).map((p) => key('PAGE', p.id))
  ]);
  const rows = new Map<string, Row>();
  const rowFor = (entityType: EntityType, entityId: string): Row => {
    const k = key(entityType, entityId);
    const existing = rows.get(k);
    if (existing) return existing;
    const row: Row = { entityType, entityId, path: entityPath(entityType, entityId), label: null, sync: null, target: null, links: [] };
    rows.set(k, row);
    return row;
  };

  for (const d of docs) {
    if (!d.syncActive || !d.prompt || !isSyncHolder(d.entityType) || isArchivedRef(archived, d.entityType, d.entityId)) continue;
    const row = rowFor(d.entityType as EntityType, d.entityId);
    const lastSync = readLastSync(d);
    row.sync = { docId: d.id, prompt: d.prompt, lastSync, need: null };
    row.target = { entityType: 'DOC', id: d.id, holder: { entityType: d.entityType, entityId: d.entityId }, lastSync, requestedAt: d.syncRequestedAt };
  }
  for (const p of pages) {
    if (!p.syncActive || !p.prompt) continue;
    const row = rowFor('PAGE', p.id);
    const lastSync = readLastSync(p);
    row.sync = { docId: null, prompt: p.prompt, lastSync, need: null };
    row.target = { entityType: 'PAGE', id: p.id, holder: { entityType: 'PAGE', entityId: p.id }, lastSync, requestedAt: p.syncRequestedAt };
  }

  // A link on a doc counts under the doc, unless the doc's entity is archived.
  const docIds = [...new Set(links.filter((l) => l.entityType === 'DOC').map((l) => l.entityId))];
  const linkDocs = docIds.length > 0
    ? await reg.prisma.doc.findMany({ where: { id: { in: docIds } }, select: { id: true, title: true, entityType: true, entityId: true } })
    : [];
  const docById = new Map(linkDocs.map((d) => [d.id, d]));
  for (const l of links) {
    if (paused.has(key(l.entityType, l.entityId)) || isArchivedRef(archived, l.entityType, l.entityId)) continue;
    const row = l.entityType === 'DOC' ? (() => {
      const doc = docById.get(l.entityId);
      if (!doc || isArchivedRef(archived, doc.entityType, doc.entityId)) return null;
      const r = rowFor('DOC', doc.id);
      r.label = doc.title;
      r.path = docPath(doc.entityType as EntityType, doc.entityId, doc.id);
      return r;
    })() : rowFor(l.entityType as EntityType, l.entityId);
    row?.links.push({ id: l.id, url: l.url, title: l.title, syncedAt: l.syncedAt, sourceEditedAt: l.sourceEditedAt, syncSource: l.syncSource });
  }

  const all = [...rows.values()];
  const needs = await loadSyncNeeds(reg, all.flatMap((r) => (r.target ? [r.target] : [])));
  const labels = await resolveEntityLabels(reg, all.filter((r) => r.entityType !== 'DOC').map((r) => ({ entityType: r.entityType, entityId: r.entityId })));
  return all
    .map((r) => ({ ...r, label: r.label ?? labels.labelOf(r.entityType, r.entityId) }))
    .filter((r): r is Row & { label: string } => r.label !== null)
    .map((r): SyncEntity => ({
      entityType: r.entityType,
      entityId: r.entityId,
      label: r.label,
      path: r.path,
      sync: r.sync && r.target ? { ...r.sync, need: needs.get(syncNeedKey(r.target.entityType, r.target.id)) ?? null } : null,
      links: r.links
    }))
    .sort((a, b) => Number(b.sync !== null) - Number(a.sync !== null) || a.label.localeCompare(b.label));
};
