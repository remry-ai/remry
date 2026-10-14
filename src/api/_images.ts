// Cross-domain helper (not a domain): images pasted or dropped into an editor (a doc,
// a wiki page). The editor uploads each one on save and writes `storage://<key>` into
// the content in place of the browser's temporary blob: address.

import type { Registry } from '$shared/registry';
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
