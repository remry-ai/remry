import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable } from '$api/_archive';
import { resolveEntityLabel } from '$api/_entity-labels';
import type { EntityType } from '$shared/types/enums';
import { entityPath } from '$shared/utils/entity';
import { linkSearchKey, normalizeLinkUrl } from './url';

// ----- Types -----

export interface LinkSummary {
  readonly id: string;
  readonly url: string;
  readonly title: string | null;
  /** When the entity was last brought up to date from this source; null for a plain link. */
  readonly syncedAt: Date | null;
  readonly createdAt: Date;
}

export interface LinkMatch extends LinkSummary {
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly label: string;
  readonly path: string;
}

export interface FindLinksInput {
  readonly url?: string;
  readonly contains?: string;
}

const FIND_LIMIT = 50;

// ----- Operations -----

export const listLinks = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string
): Promise<Result<readonly LinkSummary[]>> => {
  const links = await reg.prisma.link.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' }
  });
  return ok(links.map((l) => ({
    id: l.id,
    url: l.url,
    title: l.title,
    syncedAt: l.syncedAt,
    createdAt: l.createdAt
  })));
};

/**
 * Links whose URL is the given one (compared normalized: protocol, `www.`,
 * trailing slash, fragment and tracking parameters don't matter), or contains
 * the given text (case-insensitive), with the entity each is attached to.
 * Answers "is this Linear issue or Notion page already in the notebook?".
 * Links on deleted entities are left out.
 */
export const findLinks = async (
  reg: Pick<Registry, 'prisma'>,
  input: FindLinksInput
): Promise<Result<readonly LinkMatch[]>> => {
  const url = input.url?.trim();
  const contains = input.contains?.trim();
  if (!url && !contains) return err(new Error('Pass --url (the exact address) or --contains (a stable part of it, such as ENG-123 or a Notion page id)'));

  const needle = url ? linkSearchKey(url) : contains ?? '';
  const rows = await reg.prisma.link.findMany({
    where: { url: { contains: needle } },
    orderBy: { createdAt: 'desc' }
  });
  const target = url ? normalizeLinkUrl(url) : null;
  const matching = target ? rows.filter((l) => normalizeLinkUrl(l.url) === target) : rows;

  const matches: LinkMatch[] = [];
  for (const l of matching.slice(0, FIND_LIMIT)) {
    const entityType = l.entityType as EntityType;
    const label = await resolveEntityLabel(reg, entityType, l.entityId);
    if (label === null) continue;
    matches.push({
      id: l.id,
      url: l.url,
      title: l.title,
      syncedAt: l.syncedAt,
      createdAt: l.createdAt,
      entityType,
      entityId: l.entityId,
      label,
      path: entityPath(entityType, l.entityId)
    });
  }
  return ok(matches);
};

export const addLink = async (
  reg: Pick<Registry, 'prisma' | 'now'>,
  entityType: EntityType,
  entityId: string,
  input: { readonly url: string; readonly title?: string; readonly synced?: boolean }
): Promise<Result<{ readonly id: string }>> => {
  const writable = await ensureWritable(reg, entityType, entityId);
  if (!writable.ok) return err(writable.error);
  const link = await reg.prisma.link.create({
    data: {
      entityType,
      entityId,
      url: input.url,
      title: input.title,
      syncedAt: input.synced ? reg.now() : null
    }
  });
  return ok({ id: link.id });
};

/** Records that the entity was just brought up to date from this link's source. */
export const markLinkSynced = async (
  reg: Pick<Registry, 'prisma' | 'now'>,
  id: string
): Promise<Result<{ readonly id: string; readonly syncedAt: Date }>> => {
  const existing = await reg.prisma.link.findUnique({ where: { id } });
  if (!existing) return err(new Error('Link not found. Find it with link.find --url, or add it with link.add --synced true'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  const syncedAt = reg.now();
  await reg.prisma.link.update({ where: { id }, data: { syncedAt } });
  return ok({ id, syncedAt });
};

export const removeLink = async (
  reg: Pick<Registry, 'prisma'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.link.findUnique({ where: { id } });
  if (!existing) return err(new Error('Link not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  await reg.prisma.link.delete({ where: { id } });
  return ok({ deleted: true as const });
};
