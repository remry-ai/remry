// Cross-domain helper (not a domain): a file uploaded as base64, from the app (an image pasted
// into the editor, an attached PDF) or from Claude in a chat (Cowork, where the file is in its
// sandbox, not on this Mac, so it arrives as text Claude writes out). `decodeUpload` takes what
// either sends, checks it, and says what the bytes are.

import { ok, err, type Result } from '$shared/utils';

/** Every kind of file the app stores: images in a doc's or page's text, and a doc's source PDF. */
export const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];

/** What the bytes start with, or null for anything the app doesn't store. */
export const sniffFileType = (bytes: Uint8Array): UploadType | null => {
  const starts = (...sig: readonly number[]): boolean => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  // Readers take a PDF whose header comes after a few stray bytes, within the first kilobyte.
  if (Buffer.from(bytes.subarray(0, 1024)).includes('%PDF-')) return 'application/pdf';
  return null;
};

export interface DecodedUpload<T extends UploadType = UploadType> {
  readonly bytes: Buffer;
  /** What the bytes are, which wins over any type the upload named. */
  readonly contentType: T;
}

const DATA_URL_PREFIX = /^data:[^,]*;base64,/i;
const BASE64 = /^[A-Za-z0-9+/_-]*={0,2}$/;

/**
 * Decodes an upload into one of `accepted` (named in errors as `what`, e.g. "a PNG, JPEG, GIF
 * or WebP image"). Takes a `data:` URL prefix and line breaks; refuses text that isn't base64,
 * or bytes of another kind, with what to do; goes by the bytes, not the named type.
 */
export const decodeUpload = <T extends UploadType>(
  dataBase64: string,
  accepted: readonly T[],
  what: string
): Result<DecodedUpload<T>> => {
  const text = dataBase64.trim().replace(DATA_URL_PREFIX, '').replace(/\s+/g, '');
  if (!text) return err(new Error("The file is empty. Send the file's bytes as base64."));
  if (!BASE64.test(text)) {
    return err(new Error("The file isn't valid base64: it has characters base64 doesn't use. Send the file's bytes as base64, with nothing else (a data: URL prefix is fine)."));
  }
  const bytes = Buffer.from(text, /[-_]/.test(text) ? 'base64url' : 'base64');
  const type = sniffFileType(bytes);
  if (!type || !(accepted as readonly UploadType[]).includes(type)) {
    return err(new Error(`That isn't ${what} (or the base64 was cut short). Send the whole file, encoded once.`));
  }
  return ok({ bytes, contentType: type as T });
};
