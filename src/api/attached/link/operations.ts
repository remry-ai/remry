import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureAttachable, ensureWritable } from '$api/_archive';
import { planEntityCleanup, removeFiles } from '$api/_entity-cleanup';
import { resolveEntityLabels } from '$api/_entity-labels';
import type { EntityType } from '$shared/types/enums';
import { entityPath } from '$shared/utils/entity';
import { linkSearchKey, normalizeLinkUrl } from './url';
import { decodeSourceFile, textSourceFile } from '$api/_uploads';
import { entityFileFolder, fileLinkKey, fileLinkUrl } from '$shared/utils/file-links';

// ----- Types -----

export interface LinkSummary {
  readonly id: string;
  readonly url: string;
  readonly title: string | null;
  /** When the entity was last brought up to date from this source; null for a plain link. */
  readonly syncedAt: Date | null;
  /** The source's own last-edited time at that sync; a later one at the source means it changed. */
  readonly sourceEditedAt: Date | null;
  /** A file link whose text is saved: a read returns that instead of opening the file. */
  readonly hasText: boolean;
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

/** Every column but the saved text, which a list leaves out (it can be a whole PDF's worth). */
const SUMMARY_SELECT = { id: true, entityType: true, entityId: true, url: true, title: true, syncedAt: true, sourceEditedAt: true, createdAt: true } as const;

/** Which of these links have saved text. */
const idsWithText = async (reg: Pick<Registry, 'prisma'>, ids: readonly string[]): Promise<ReadonlySet<string>> => {
  if (ids.length === 0) return new Set();
  const rows = await reg.prisma.link.findMany({ where: { id: { in: [...ids] }, text: { not: null } }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
};

// ----- Operations -----

export const listLinks = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string
): Promise<Result<readonly LinkSummary[]>> => {
  const links = await reg.prisma.link.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' },
    select: SUMMARY_SELECT
  });
  const withText = await idsWithText(reg, links.map((l) => l.id));
  return ok(links.map((l) => ({
    id: l.id,
    url: l.url,
    title: l.title,
    syncedAt: l.syncedAt,
    sourceEditedAt: l.sourceEditedAt,
    hasText: withText.has(l.id),
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
    orderBy: { createdAt: 'desc' },
    select: SUMMARY_SELECT
  });
  const target = url ? normalizeLinkUrl(url) : null;
  const matching = target ? rows.filter((l) => normalizeLinkUrl(l.url) === target) : rows;

  const shown = matching.slice(0, FIND_LIMIT);
  const labels = await resolveEntityLabels(reg, shown.map((l) => ({ entityType: l.entityType as EntityType, entityId: l.entityId })));
  const withText = await idsWithText(reg, shown.map((l) => l.id));
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
      sourceEditedAt: l.sourceEditedAt,
      hasText: withText.has(l.id),
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
  input: { readonly url: string; readonly title?: string; readonly synced?: boolean; readonly sourceEditedAt?: Date }
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
      syncedAt: input.synced ? reg.now() : null,
      sourceEditedAt: input.synced ? input.sourceEditedAt ?? null : null
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

/** A file's contents: its bytes as base64, or a text file's text (no base64, a third smaller). */
export type UploadContent = { readonly dataBase64: string } | { readonly text: string };

/**
 * Uploads a file as a link on any entity whose page shows links: the file goes in the entity's
 * own folder (`docs/<id>/`, `pages/<id>/`, `projects/<id>/`…; `entityFileFolder`), which goes
 * when the entity does, and the
 * link points at it, `storage://<key>`, titled with the file's name. Any file Claude can read
 * (`decodeSourceFile`: a PDF, an image or text, or `textSourceFile` for text sent as text);
 * anything else is refused, saying what to do.
 */
export const uploadLinkFile = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'uuid' | 'now'>,
  entityType: EntityType,
  entityId: string,
  content: UploadContent,
  fileName?: string
): Promise<Result<{ readonly id: string; readonly url: string }>> => {
  const folder = entityFileFolder(entityType, entityId);
  if (!folder) return err(new Error('A file can be uploaded to a person, group, project, goal, wiki page or doc. Add a link to it here instead.'));
  const writable = await ensureAttachable(reg, entityType, entityId);
  if (!writable.ok) return err(writable.error);
  const file = 'text' in content ? textSourceFile(content.text, fileName) : decodeSourceFile(content.dataBase64, fileName);
  if (!file.ok) return err(file.error);

  const key = `${folder}/file-${reg.uuid()}.${file.value.extension}`;
  await reg.storage.putObject(key, file.value.bytes, file.value.contentType);
  const url = fileLinkUrl(key);
  // A text file's saved text is the file itself: searchable at once, with nothing to write later.
  const text = file.value.contentType.startsWith('text/') ? new TextDecoder('utf-8').decode(file.value.bytes) : null;
  const link = await reg.prisma.link.create({ data: { entityType, entityId, url, title: titleFor(fileName), text } });
  return ok({ id: link.id, url });
};

/**
 * Records that the entity was just brought up to date from this link's source, or checked against
 * it and found current. With `sourceEditedAt` (the source's own last-edited time, as read now), a
 * later check compares that instead of reading the source again; without it, the last one stays.
 */
export const markLinkSynced = async (
  reg: Pick<Registry, 'prisma' | 'now'>,
  id: string,
  sourceEditedAt?: Date
): Promise<Result<{ readonly id: string; readonly syncedAt: Date; readonly sourceEditedAt: Date | null }>> => {
  const existing = await reg.prisma.link.findUnique({ where: { id } });
  if (!existing) return err(new Error('Link not found. Find it with link.find --url, or add it with link.add --synced true'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  const syncedAt = reg.now();
  const updated = await reg.prisma.link.update({
    where: { id },
    data: { syncedAt, ...(sourceEditedAt ? { sourceEditedAt } : {}) },
    select: { sourceEditedAt: true }
  });
  return ok({ id, syncedAt, sourceEditedAt: updated.sourceEditedAt });
};

/** Whether the link points at a file uploaded to its own entity (the only files a read or a saved text covers). */
const ownFileKey = (link: { readonly url: string; readonly entityType: string; readonly entityId: string }): string | null => {
  const key = fileLinkKey(link.url);
  const folder = entityFileFolder(link.entityType, link.entityId);
  return key && folder && key.startsWith(`${folder}/`) ? key : null;
};

export interface UpdateLinkInput {
  readonly title?: string | null;
  /** A file link's text (null clears it, so reads open the file again). */
  readonly text?: string | null;
}

/** Renames a link, or saves a file link's text so later reads needn't open the file. */
export const updateLink = async (
  reg: Pick<Registry, 'prisma' | 'now'>,
  id: string,
  input: UpdateLinkInput
): Promise<Result<{ readonly id: string }>> => {
  const existing = await reg.prisma.link.findUnique({ where: { id }, select: SUMMARY_SELECT });
  if (!existing) return err(new Error('Link not found. Find it with link.list --entityType --entityId.'));
  if (input.text !== undefined && input.text !== null && !ownFileKey(existing)) {
    return err(new Error('Only a file uploaded as a link keeps its text. An outside page stays where it is: read it with its own tool.'));
  }
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);
  const text = input.text === undefined ? undefined : input.text?.trim() ? input.text : null;
  await reg.prisma.link.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
      ...(text !== undefined ? { text } : {})
    }
  });
  return ok({ id });
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
  const key = ownFileKey(existing);
  if (key) {
    try {
      await reg.storage.deleteObject(key);
    } catch (error) {
      reg.logger.warn({ id, key, error }, 'failed to delete the file of a removed link');
    }
  }
  return ok({ deleted: true as const });
};

/** How much of a text file a read returns; past this it's cut and marked `truncated`. */
export const READ_TEXT_LIMIT = 200_000;
/** The largest image and PDF a read hands over (Claude reads images up to 5 MB). */
export const READ_IMAGE_BYTES = 5 * 1024 * 1024;
export const READ_PDF_BYTES = 20 * 1024 * 1024;

/** A file a read hands over as it is, for a client that shows it (the MCP server makes an image or document block). */
export interface ReadAttachment {
  readonly mimeType: string;
  readonly dataBase64: string;
}

export type LinkFileRead =
  | {
    readonly title: string | null;
    readonly kind: 'text';
    readonly text: string;
    readonly truncated?: true;
    /** Set when this is the saved text of a PDF or image: read with original: true for what text can't hold. */
    readonly savedTextOf?: 'pdf' | 'image';
  }
  | {
    readonly title: string | null;
    readonly kind: 'image' | 'pdf';
    readonly attachment: ReadAttachment;
    /** False when the file has no saved text yet: write it with link.update --text after reading, so later reads skip the file. */
    readonly textSaved: boolean;
  };

const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const cutText = (text: string): { readonly text: string; readonly truncated?: true } =>
  text.length > READ_TEXT_LIMIT ? { text: text.slice(0, READ_TEXT_LIMIT), truncated: true as const } : { text };

/** The kind of original a saved text stands for, from the file's extension. */
const originalKind = (key: string): 'pdf' | 'image' | null => {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'pdf') return 'pdf';
  return ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? 'image' : null;
};

/**
 * Reads a file uploaded as a link, for Claude. Its saved text when it has one (cut at
 * `READ_TEXT_LIMIT`), so a PDF or image isn't opened again; with `original`, or with no saved
 * text, the file: a text file's text, or an image or PDF as an attachment. Only a file in the
 * link's own folder; an outside link is refused, saying to read it with its own tool.
 */
export const readLinkFile = async (
  reg: Pick<Registry, 'prisma' | 'storage'>,
  id: string,
  options: { readonly original?: boolean } = {}
): Promise<Result<LinkFileRead>> => {
  const link = await reg.prisma.link.findUnique({ where: { id } });
  if (!link) return err(new Error('Link not found. Find it with link.list --entityType --entityId.'));
  const key = ownFileKey(link);
  if (!key) {
    return err(new Error(`That link points outside the notebook (${link.url}). Read it with the tool for that site.`));
  }
  const saved = link.text ?? null;
  if (saved !== null && !options.original) {
    const of = originalKind(key);
    return ok({ title: link.title, kind: 'text', ...cutText(saved), ...(of ? { savedTextOf: of } : {}) });
  }
  const file = await reg.storage.readObject(key);
  if (!file) return err(new Error("The link's file is missing from this notebook's files folder. Ask the user to upload it again."));

  const title = link.title;
  const tooBig = (limit: number) => err(new Error(`That file is ${megabytes(file.bytes.length)}, more than the ${megabytes(limit)} a read hands over. Ask the user to paste what you need from it.`));
  if (file.contentType === 'application/pdf') {
    if (file.bytes.length > READ_PDF_BYTES) return tooBig(READ_PDF_BYTES);
    return ok({ title, kind: 'pdf', attachment: { mimeType: file.contentType, dataBase64: Buffer.from(file.bytes).toString('base64') }, textSaved: saved !== null });
  }
  if (file.contentType.startsWith('image/')) {
    if (file.bytes.length > READ_IMAGE_BYTES) return tooBig(READ_IMAGE_BYTES);
    return ok({ title, kind: 'image', attachment: { mimeType: file.contentType, dataBase64: Buffer.from(file.bytes).toString('base64') }, textSaved: saved !== null });
  }
  return ok({ title, kind: 'text', ...cutText(new TextDecoder('utf-8').decode(file.bytes)) });
};

