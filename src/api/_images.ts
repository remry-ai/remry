// Cross-domain helper (not a domain): images pasted or dropped into an editor (a doc,
// a wiki page). The editor uploads each one on save and writes `storage://<key>` into
// the content in place of the browser's temporary blob: address.

import type { Registry } from '$shared/registry';
import type { StoredFile } from '$shared/storage/client.server';
import { ok, err, type Result } from '$shared/utils';

export const EDITOR_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type EditorImageType = (typeof EDITOR_IMAGE_TYPES)[number];

/** The largest image an upload takes, as base64 (about 10 MB). */
export const MAX_IMAGE_BASE64_CHARS = 14_000_000;

const IMAGE_EXTENSIONS: Readonly<Record<EditorImageType, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

/** Stores an image under `<folder>/` and returns its storage key. */
export const storeEditorImage = async (
  reg: Pick<Registry, 'storage' | 'uuid'>,
  folder: string,
  contentType: EditorImageType,
  dataBase64: string
): Promise<{ readonly key: string }> => {
  const key = `${folder}/image-${reg.uuid()}.${IMAGE_EXTENSIONS[contentType]}`;
  await reg.storage.putObject(key, Buffer.from(dataBase64, 'base64'), contentType);
  return { key };
};

const BLOB_URL = /\]\(\s*<?blob:/;

/**
 * Refuses content holding a browser's temporary blob: address. It only works in the
 * tab that made it, so saved, the image is gone after a reload. The editor uploads
 * images before saving; this catches one that wasn't.
 */
export const refuseBlobUrls = (content: string): Result<void> =>
  BLOB_URL.test(content)
    ? err(new Error("An image in the content is still a temporary blob: address, so it wasn't uploaded and would be lost. Paste or drop it again, then save."))
    : ok(undefined);

// ----- Images taken out of the text -----

/** Where images taken out of the text wait, inside the doc's or page's folder. */
export const REMOVED_FOLDER = 'removed';
/** How long a removed image waits before it's deleted for good: long enough to undo. */
export const REMOVED_GRACE_MS = 24 * 60 * 60 * 1000;

const IMAGE_FILE = /^image-[^/]+\.(png|jpg|gif|webp)$/;
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The names of the folder's images the content shows, as `storage://<key>` or the files route's `/files/<key>`. */
export const imageNamesIn = (content: string, folder: string): ReadonlySet<string> => {
  const pattern = new RegExp(`(?:storage://|/files/)${escapeRegExp(folder)}/([^\\s)"'?#/]+)`, 'g');
  const names = new Set<string>();
  for (const match of content.matchAll(pattern)) {
    try {
      names.add(decodeURIComponent(match[1]!));
    } catch {
      names.add(match[1]!);
    }
  }
  return names;
};

export interface ImageTidyPlan {
  /** Back from removed/: the text shows them again (an undo). */
  readonly restore: readonly string[];
  /** Into removed/: no longer in the text. */
  readonly remove: readonly string[];
  /** Deleted for good: in removed/ for longer than the grace period. */
  readonly purge: readonly string[];
}

/**
 * What to do with a doc's or page's images after its text is saved. Only `image-*`
 * files are touched, never the PDF or anything else in the folder.
 */
export const planImageTidy = (
  shown: ReadonlySet<string>,
  present: readonly StoredFile[],
  removed: readonly StoredFile[],
  now: Date,
  graceMs: number = REMOVED_GRACE_MS
): ImageTidyPlan => {
  const presentNames = new Set(present.map((f) => f.name));
  const restore = removed.filter((f) => shown.has(f.name) && !presentNames.has(f.name)).map((f) => f.name);
  const restoring = new Set(restore);
  return {
    restore,
    remove: present.filter((f) => IMAGE_FILE.test(f.name) && !shown.has(f.name)).map((f) => f.name),
    purge: removed
      .filter((f) => !restoring.has(f.name) && now.getTime() - f.modifiedAt.getTime() > graceMs)
      .map((f) => f.name)
  };
};

/**
 * After a doc's or page's text is saved: images no longer in it move to its removed/
 * folder, ones the text shows again come back, and ones removed over a day ago are
 * deleted. Best effort: a file that can't be moved is logged, not an error.
 */
export const tidyEditorImages = async (
  reg: Pick<Registry, 'storage' | 'logger' | 'now'>,
  folder: string,
  content: string
): Promise<void> => {
  const removedFolder = `${folder}/${REMOVED_FOLDER}`;
  try {
    const [present, removed] = await Promise.all([reg.storage.listFolder(folder), reg.storage.listFolder(removedFolder)]);
    const plan = planImageTidy(imageNamesIn(content, folder), present, removed, reg.now());
    for (const name of plan.restore) await reg.storage.moveObject(`${removedFolder}/${name}`, `${folder}/${name}`);
    for (const name of plan.remove) await reg.storage.moveObject(`${folder}/${name}`, `${removedFolder}/${name}`);
    for (const name of plan.purge) await reg.storage.deleteObject(`${removedFolder}/${name}`);
  } catch (error) {
    reg.logger.warn({ folder, error }, 'failed to tidy the images of a saved doc or page');
  }
};
