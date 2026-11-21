// A file uploaded as a link lives in its own entity's folder, so it goes when that entity does.
// The sync_doc_per_entity migration moved a sync doc's sources onto its entity in SQL, which
// can't move files: those links still point into the doc's folder. This copies each such file
// into its link's own entity's folder and points the link at the copy. Run once per process
// after migrating (ensureDatabase); once every file is in place it finds nothing to do.

import type { Registry } from '$shared/registry';
import { entityFileFolder, fileLinkKey, fileLinkUrl } from '$shared/utils/file-links';
import { copyFileLink } from '$api/convert/rehome';

/** Whether a file link's key is outside its entity's own folder (pure). */
export const isStrayFileLink = (link: { readonly entityType: string; readonly entityId: string; readonly url: string }): boolean => {
  const key = fileLinkKey(link.url);
  const folder = entityFileFolder(link.entityType, link.entityId);
  return key !== null && folder !== null && !key.startsWith(`${folder}/`);
};

/** Copies files whose link moved to another entity into that entity's folder. Returns how many moved. */
export const adoptStrayFileLinks = async (reg: Pick<Registry, 'prisma' | 'storage' | 'logger'>): Promise<number> => {
  const links = await reg.prisma.link.findMany({
    where: { url: { startsWith: fileLinkUrl('') } },
    select: { id: true, entityType: true, entityId: true, url: true }
  });
  let moved = 0;
  for (const link of links.filter(isStrayFileLink)) {
    const folder = entityFileFolder(link.entityType, link.entityId);
    if (!folder) continue;
    try {
      const old = await copyFileLink(reg, link, folder);
      if (!old) continue;
      await reg.storage.deleteObject(old);
      moved += 1;
    } catch (error) {
      reg.logger.warn({ id: link.id, folder, error }, 'failed to move a file link into its entity\'s folder');
    }
  }
  return moved;
};
