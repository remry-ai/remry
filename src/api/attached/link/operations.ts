import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureAttachable, ensureWritable } from '$api/_archive';
import { planEntityCleanup, removeFiles } from '$api/_entity-cleanup';
import { resolveEntityLabels } from '$api/_entity-labels';
import type { EntityType } from '$shared/types/enums';
import { entityPath } from '$shared/utils/entity';
import { linkSearchKey, normalizeLinkUrl } from './url';
import { decodeSourceFile } from '$api/_uploads';
import { entityFileFolder, fileLinkKey, fileLinkUrl } from '$shared/utils/file-links';

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

  const shown = matching.slice(0, FIND_LIMIT);
  const labels = await resolveEntityLabels(reg, shown.map((l) => ({ entityType: l.entityType as EntityType, entityId: l.entityId })));
  const matches: LinkMatch[] = [];
  for (const l of shown) {
    const entityType = l.entityType as EntityType;
    const label = labels.labelOf(entityType, l.entityId);
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
  // A file link is made only by uploading the file (uploadLinkFile), so it always points into the entity's own folder.
  if (fileLinkKey(input.url)) return err(new Error('A storage:// address is made by uploading the file (link.upload), not added by hand.'));
  const writable = await ensureAttachable(reg, entityType, entityId);
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

/** File names longer than a link's title may be (200) keep their end, where the extension is. */
const titleFor = (fileName: string | undefined): string | undefined => {
  const name = fileName?.trim().replace(/^.*[\\/]/, '');
  if (!name) return undefined;
  return name.length <= 200 ? name : `…${name.slice(-199)}`;
};

/**
 * Uploads a file as a link on a doc or wiki page: the file goes in the entity's own folder
 * (`docs/<id>/` or `pages/<id>/`, beside its images, so it goes when the entity does) and the
 * link points at it, `storage://<key>`, titled with the file's name. Any file Claude can read
 * (`decodeSourceFile`: a PDF, an image or text); anything else is refused, saying what to do.
 */
export const uploadLinkFile = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'uuid' | 'now'>,
  entityType: EntityType,
  entityId: string,
  dataBase64: string,
  fileName?: string
): Promise<Result<{ readonly id: string; readonly url: string }>> => {
  const folder = entityFileFolder(entityType, entityId);
  if (!folder) return err(new Error('A file can be uploaded to a doc or a wiki page. Add a link to it here instead.'));
  const writable = await ensureAttachable(reg, entityType, entityId);
  if (!writable.ok) return err(writable.error);
  const file = decodeSourceFile(dataBase64, fileName);
  if (!file.ok) return err(file.error);

  const key = `${folder}/file-${reg.uuid()}.${file.value.extension}`;
  await reg.storage.putObject(key, file.value.bytes, file.value.contentType);
  const url = fileLinkUrl(key);
  const link = await reg.prisma.link.create({ data: { entityType, entityId, url, title: titleFor(fileName) } });
  return ok({ id: link.id, url });
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

/** Also deletes what's attached to the link and its relations, and a file link's file. */
export const removeLink = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger' | 'now'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.link.findUnique({ where: { id } });
  if (!existing) return err(new Error('Link not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  const cleanup = await planEntityCleanup(reg, 'LINK', id);
  await reg.prisma.$transaction([...cleanup.ops, reg.prisma.link.delete({ where: { id } })]);
  await removeFiles(reg, cleanup);
  // Only ever a file in the entity's own folder, which is where uploads put them.
  const key = fileLinkKey(existing.url);
  const folder = entityFileFolder(existing.entityType, existing.entityId);
  if (key && folder && key.startsWith(`${folder}/`)) {
    try {
      await reg.storage.deleteObject(key);
    } catch (error) {
      reg.logger.warn({ id, key, error }, 'failed to delete the file of a removed link');
    }
  }
  return ok({ deleted: true as const });
};
