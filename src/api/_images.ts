// Cross-domain helper (not a domain): images pasted or dropped into an editor (a doc,
// a wiki page). The editor uploads each one on save and writes `storage://<key>` into
// the content in place of the browser's temporary blob: address.

import type { Registry } from '$shared/registry';
import type { StoredFile } from '$shared/storage/client.server';
import { ok, err, type Result } from '$shared/utils';
import { decodeUpload, type DecodedUpload } from '$api/_uploads';

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

/** An editor image: a PNG, JPEG, GIF or WebP, by its bytes (see `decodeUpload`). */
export const decodeImage = (dataBase64: string): Result<DecodedUpload<EditorImageType>> =>
  decodeUpload(dataBase64, EDITOR_IMAGE_TYPES, 'a PNG, JPEG, GIF or WebP image');

export interface StoredImage {
  readonly key: string;
  /** Paste into the doc's or page's content, then save it with the text (doc.update, page.update). */
  readonly markdown: string;
}

/** Stores an image under `<folder>/` and returns its storage key, and the markdown that shows it. */
export const storeEditorImage = async (
  reg: Pick<Registry, 'storage' | 'uuid'>,
  folder: string,
  dataBase64: string
): Promise<Result<StoredImage>> => {
  const image = decodeImage(dataBase64);
  if (!image.ok) return err(image.error);
  const key = `${folder}/image-${reg.uuid()}.${IMAGE_EXTENSIONS[image.value.contentType]}`;
  await reg.storage.putObject(key, image.value.bytes, image.value.contentType);
  return ok({ key, markdown: `![](storage://${key})` });
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
    await purgeTrash(reg);
  } catch (error) {
    reg.logger.warn({ folder, error }, 'failed to tidy the images of a saved doc or page');
  }
};

// ----- Images stored under another doc or page -----

/** One image the text shows from another doc's or page's folder. */
export interface ForeignImage {
  /** As the text has it: `docs/<id>/image-….png` (after `storage://` or `/files/`). */
  readonly key: string;
  /** The folder it's in (`docs/<id>`), where a tidied-away copy waits in `removed/`. */
  readonly folder: string;
  readonly name: string;
}

const FOREIGN_IMAGE = /(?:storage:\/\/|\/files\/)((docs|pages)\/([^\s)"'?#/]+)\/(?:removed\/)?(image-[^\s)"'?#/]+\.(?:png|jpg|gif|webp)))/g;

/** The images the text shows from folders other than `folder`, each once. */
export const foreignImagesIn = (content: string, folder: string): readonly ForeignImage[] => {
  const found = new Map<string, ForeignImage>();
  for (const match of content.matchAll(FOREIGN_IMAGE)) {
    const [, key, kind, id, name] = match as unknown as [string, string, string, string, string];
    const owner = `${kind}/${id}`;
    if (owner === folder || found.has(key)) continue;
    found.set(key, { key, folder: owner, name });
  }
  return [...found.values()];
};

/**
 * Copies the images the text shows from another doc's or page's folder into `folder`, and
 * points the text at the copies. A doc moved by copying its text to a new doc, or turned into a
 * wiki page, kept showing the old doc's images, and lost them when the old doc was deleted
 * (its folder goes with it). It looks in the folder, its `removed/` and the trash; an image
 * already gone for good is left as it is.
 */
export const adoptForeignImages = async (
  reg: Pick<Registry, 'storage' | 'uuid' | 'logger'>,
  folder: string,
  content: string
): Promise<string> => {
  let adopted = content;
  for (const image of foreignImagesIn(content, folder)) {
    try {
      const file = (await reg.storage.readObject(image.key))
        ?? (await reg.storage.readObject(`${image.folder}/${REMOVED_FOLDER}/${image.name}`))
        ?? (await reg.storage.readObject(trashKey(image.folder, image.name)));
      if (!file) continue;
      const extension = image.name.slice(image.name.lastIndexOf('.'));
      const key = `${folder}/image-${reg.uuid()}${extension}`;
      await reg.storage.putObject(key, file.bytes, file.contentType);
      adopted = adopted.split(image.key).join(key);
    } catch (error) {
      reg.logger.warn({ folder, image: image.key, error }, 'failed to copy an image from another doc or page');
    }
  }
  return adopted;
};

// ----- The trash: a deleted doc's or page's images, kept a day -----

/**
 * When a doc or page is deleted, its images wait here for a day (`REMOVED_GRACE_MS`) instead
 * of going at once, one flat folder, each named for where it came from:
 * `trash/docs.<id>.image-….png`. Text copied from it before or after the delete (a doc moved by
 * copying it, in either order) still finds them: `adoptForeignImages` looks here too.
 */
export const TRASH_FOLDER = 'trash';

/** The trash key for an image from `folder` (`docs/<id>`). */
export const trashKey = (folder: string, name: string): string => `${TRASH_FOLDER}/${folder.replace('/', '.')}.${name}`;

/** The trashed images to delete for good: in the trash longer than the grace period. */
export const planTrashPurge = (trashed: readonly StoredFile[], now: Date, graceMs: number = REMOVED_GRACE_MS): readonly string[] =>
  trashed.filter((f) => now.getTime() - f.modifiedAt.getTime() > graceMs).map((f) => f.name);

/** Deletes trashed images past the grace period. Best effort, like the rest of the tidying. */
export const purgeTrash = async (reg: Pick<Registry, 'storage' | 'logger' | 'now'>): Promise<void> => {
  try {
    for (const name of planTrashPurge(await reg.storage.listFolder(TRASH_FOLDER), reg.now())) {
      await reg.storage.deleteObject(`${TRASH_FOLDER}/${name}`);
    }
  } catch (error) {
    reg.logger.warn({ error }, 'failed to empty the image trash');
  }
};

/** Moves a deleted doc's or page's images (its own and those set aside in `removed/`) to the trash. */
export const trashImages = async (reg: Pick<Registry, 'storage'>, folder: string): Promise<void> => {
  for (const from of [folder, `${folder}/${REMOVED_FOLDER}`]) {
    for (const file of await reg.storage.listFolder(from)) {
      if (IMAGE_FILE.test(file.name)) await reg.storage.moveObject(`${from}/${file.name}`, trashKey(folder, file.name));
    }
  }
};
