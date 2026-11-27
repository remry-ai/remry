// What "run the Remry sync" goes through: every unarchived entity with an active sync that has a
// prompt (a person's, group's, project's or goal's sync doc, or a sync page), each with its sync
// sources. Paused syncs, archived entities and links that aren't sync sources are left out, so a
// notebook with many tracked links doesn't turn into a long run.

import type { Registry } from '$shared/registry';
import type { EntityType } from '$shared/types/enums';
import type { LastSync, SyncNeed } from '$shared/types/sync-now';
import { isSyncHolder } from '$shared/utils/file-links';
import { readLastSync } from '$shared/utils/sync-state';
import { entityPath } from '$shared/utils/entity';
import { isArchivedRef, loadArchivedIds } from '$api/_archive';
import { resolveEntityLabels } from '$api/_entity-labels';
import { LAST_SYNC_FIELDS, loadSyncNeeds, syncNeedKey, type SyncNeedTarget } from '$api/_last-sync';

export interface SyncSourceLink {
  readonly id: string;
  readonly url: string;
  readonly title: string | null;
  /** When the entity was last brought up to date from it; null when it hasn't been synced yet. */
  readonly syncedAt: Date | null;
  /** The source's own last-edited time at that sync: a later one at the source means it changed. */
  readonly sourceEditedAt: Date | null;
}

export interface SyncEntity {
  /** The synced entity: a person, group, project, goal or wiki page. */
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly label: string;
  readonly path: string;
  readonly sync: {
    /** Its sync doc; null for a wiki page, whose own content is the text. */
    readonly docId: string | null;
    readonly prompt: string;
    readonly lastSync: LastSync | null;
    /** Why it's due (null when it isn't): its sources still have to be checked either way. */
    readonly need: SyncNeed | null;
  };
  /** Its sync sources (its links marked syncSource), oldest first. */
  readonly links: readonly SyncSourceLink[];
}

/** Every unarchived entity with an active sync that has a prompt, with its sources, by name. */
export const listSyncEntities = async (reg: Pick<Registry, 'prisma' | 'now'>): Promise<readonly SyncEntity[]> => {
  const [docs, pages, archived] = await Promise.all([
    reg.prisma.doc.findMany({ where: { syncHolder: { not: null }, prompt: { not: null }, syncActive: true, bodyType: 'doc' }, select: { id: true, entityType: true, entityId: true, prompt: true, ...LAST_SYNC_FIELDS } }),
    reg.prisma.page.findMany({ where: { prompt: { not: null }, syncActive: true, archivedAt: null, bodyType: 'doc' }, select: { id: true, prompt: true, ...LAST_SYNC_FIELDS } }),
    loadArchivedIds(reg)
  ]);
  const synced = [
    ...docs.flatMap((d) => (d.prompt && isSyncHolder(d.entityType) && !isArchivedRef(archived, d.entityType, d.entityId)
      ? [{ entityType: d.entityType as EntityType, entityId: d.entityId, docId: d.id as string | null, prompt: d.prompt, row: d, target: 'DOC' as const, targetId: d.id }]
      : [])),
    ...pages.flatMap((p) => (p.prompt ? [{ entityType: 'PAGE' as EntityType, entityId: p.id, docId: null, prompt: p.prompt, row: p, target: 'PAGE' as const, targetId: p.id }] : []))
  ];
  if (synced.length === 0) return [];

  const targets: SyncNeedTarget[] = synced.map((s) => ({
    entityType: s.target,
    id: s.targetId,
    holder: { entityType: s.entityType as SyncNeedTarget['holder']['entityType'], entityId: s.entityId },
    lastSync: readLastSync(s.row),
    requestedAt: s.row.syncRequestedAt
  }));
  const [needs, labels, links] = await Promise.all([
    loadSyncNeeds(reg, targets),
    resolveEntityLabels(reg, synced.map((s) => ({ entityType: s.entityType, entityId: s.entityId }))),
    reg.prisma.link.findMany({
      where: { syncSource: true, OR: synced.map((s) => ({ entityType: s.entityType, entityId: s.entityId })) },
      orderBy: { createdAt: 'asc' },
      select: { id: true, entityType: true, entityId: true, url: true, title: true, syncedAt: true, sourceEditedAt: true }
    })
  ]);
  const linksOf = new Map<string, SyncSourceLink[]>();
  for (const { entityType, entityId, ...link } of links) {
    const key = `${entityType}:${entityId}`;
    linksOf.set(key, [...(linksOf.get(key) ?? []), link]);
  }

  return synced
    .flatMap((s): SyncEntity[] => {
      const label = labels.labelOf(s.entityType, s.entityId);
      if (label === null) return [];
      return [{
        entityType: s.entityType,
        entityId: s.entityId,
        label,
        path: entityPath(s.entityType, s.entityId),
        sync: { docId: s.docId, prompt: s.prompt, lastSync: readLastSync(s.row), need: needs.get(syncNeedKey(s.target, s.targetId)) ?? null },
        links: linksOf.get(`${s.entityType}:${s.entityId}`) ?? []
      }];
    })
    .sort((a, b) => a.label.localeCompare(b.label));
};
