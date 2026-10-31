// Moving what hangs off one entity onto another, for entity.convert: the attached rows
// and relations go to the new entity in one transaction, and content elsewhere that
// linked to the old one is pointed at the new one.

import type { Registry } from '$shared/registry';
import type { RelatableType } from '$shared/types/enums';
import { syncMentions } from '$api/relation/mentions';
import { relinkContent } from './content';
import { entityFileFolder, fileLinkKey, fileLinkUrl } from '$shared/utils/file-links';

export interface Ref {
  readonly entityType: string;
  readonly entityId: string;
}

export interface RehomeOptions {
  /** Move its docs too (only onto something that takes docs). Default false. */
  readonly docs?: boolean;
  /** Move its links. Default true; false when they go somewhere else (a sync page's sources go to its doc). */
  readonly links?: boolean;
}

/**
 * Moves `from`'s links onto `to`. A file uploaded as a link lives in `from`'s folder, which goes
 * with `from`, so it's copied into `to`'s folder and its link pointed there. `to` must keep files
 * when `from` has any (`hasFileLinks`): a note doesn't.
 */
export const moveLinks = async (reg: Pick<Registry, 'prisma' | 'storage'>, from: Ref, to: Ref): Promise<void> => {
  const p = reg.prisma;
  const fromFolder = entityFileFolder(from.entityType, from.entityId);
  const toFolder = entityFileFolder(to.entityType, to.entityId);
  const files = fromFolder
    ? await p.link.findMany({ where: { entityType: from.entityType, entityId: from.entityId, url: { startsWith: fileLinkUrl(`${fromFolder}/`) } }, select: { id: true, url: true } })
    : [];
  await p.link.updateMany({ where: { entityType: from.entityType, entityId: from.entityId }, data: { entityType: to.entityType, entityId: to.entityId } });
  if (!fromFolder || !toFolder) return;
  for (const file of files) {
    const key = fileLinkKey(file.url);
    const stored = key ? await reg.storage.readObject(key) : null;
    if (!key || !stored) continue;
    const moved = `${toFolder}/${key.slice(fromFolder.length + 1)}`;
    await reg.storage.putObject(moved, stored.bytes, stored.contentType);
    await p.link.update({ where: { id: file.id }, data: { url: fileLinkUrl(moved) } });
  }
};

/** Whether files are uploaded as links on it (which only an entity with a files folder can take). */
export const hasFileLinks = async (reg: Pick<Registry, 'prisma'>, of: Ref): Promise<boolean> => {
  const folder = entityFileFolder(of.entityType, of.entityId);
  if (!folder) return false;
  return (await reg.prisma.link.count({ where: { entityType: of.entityType, entityId: of.entityId, url: { startsWith: fileLinkUrl(`${folder}/`) } } })) > 0;
};

/**
 * Moves the notes, todos, links, comments, reports, tags and emoji on `from` onto `to`, and
 * both ends of its relations (MENTIONS aside: those follow content, see `relinkMentions`).
 * `to` is new, so nothing it already has can clash. The old entity's page chat is dropped.
 */
export const rehomeAttachments = async (
  reg: Pick<Registry, 'prisma' | 'storage'>,
  from: Ref,
  to: Ref,
  options: RehomeOptions = {}
): Promise<void> => {
  const p = reg.prisma;
  const where = { entityType: from.entityType, entityId: from.entityId };
  const data = { entityType: to.entityType, entityId: to.entityId };
  const notMentions = { kind: { not: 'MENTIONS' } };
  await p.$transaction([
    p.note.updateMany({ where, data }),
    p.todo.updateMany({ where, data }),
    p.comment.updateMany({ where, data }),
    p.report.updateMany({ where, data }),
    p.tagAttachment.updateMany({ where, data }),
    p.emoji.updateMany({ where, data }),
    ...(options.docs ? [p.doc.updateMany({ where, data })] : []),
    p.pageChat.deleteMany({ where }),
    p.relation.updateMany({
      where: { fromType: from.entityType, fromId: from.entityId, ...notMentions },
      data: { fromType: to.entityType, fromId: to.entityId }
    }),
    p.relation.updateMany({
      where: { toType: from.entityType, toId: from.entityId, ...notMentions },
      data: { toType: to.entityType, toId: to.entityId }
    })
  ]);
  if (options.links !== false) await moveLinks(reg, from, to);
};

type ContentSource = { readonly entityType: RelatableType; readonly entityId: string };

const readContent = async (reg: Pick<Registry, 'prisma'>, source: ContentSource): Promise<string | null> => {
  const p = reg.prisma;
  const id = source.entityId;
  switch (source.entityType) {
    case 'PAGE': {
      const page = await p.page.findUnique({ where: { id }, select: { content: true, bodyType: true } });
      return page && page.bodyType !== 'sheet' ? page.content : null;
    }
    case 'DOC': return (await p.doc.findUnique({ where: { id }, select: { content: true } }))?.content ?? null;
    case 'NOTE': return (await p.note.findUnique({ where: { id }, select: { content: true } }))?.content ?? null;
    case 'REPORT': return (await p.report.findUnique({ where: { id }, select: { content: true } }))?.content ?? null;
    default: return null;
  }
};

const writeContent = async (reg: Pick<Registry, 'prisma'>, source: ContentSource, content: string): Promise<void> => {
  const p = reg.prisma;
  const args = { where: { id: source.entityId }, data: { content } };
  if (source.entityType === 'PAGE') await p.page.update(args);
  else if (source.entityType === 'DOC') await p.doc.update(args);
  else if (source.entityType === 'NOTE') await p.note.update(args);
  else if (source.entityType === 'REPORT') await p.report.update(args);
};

/**
 * Rewrites every page, doc, note and report that links to the old entity (its MENTIONS) to
 * link to `toPath` instead, and re-reads their mentions, so backlinks follow the conversion.
 * Returns how many it changed. It writes past an archived source on purpose: it only keeps
 * a link working.
 */
export const relinkMentions = async (
  reg: Pick<Registry, 'prisma'>,
  from: Ref,
  fromPath: string,
  toPath: string
): Promise<number> => {
  const rows = await reg.prisma.relation.findMany({
    where: { toType: from.entityType, toId: from.entityId, kind: 'MENTIONS' },
    select: { fromType: true, fromId: true }
  });
  let changed = 0;
  for (const row of rows) {
    const source = { entityType: row.fromType as RelatableType, entityId: row.fromId };
    const content = await readContent(reg, source);
    if (content === null) continue;
    const relinked = relinkContent(content, fromPath, toPath);
    if (relinked === content) continue;
    await writeContent(reg, source, relinked);
    await syncMentions(reg, source, relinked);
    changed++;
  }
  return changed;
};
