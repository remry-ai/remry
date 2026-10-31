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
/** The bytes of a base64 upload (a data: URL prefix and line breaks are fine), or what's wrong with it. */
const decodeBase64 = (dataBase64: string): Result<Buffer> => {
  const text = dataBase64.trim().replace(DATA_URL_PREFIX, '').replace(/\s+/g, '');
  if (!text) return err(new Error("The file is empty. Send the file's bytes as base64."));
  if (!BASE64.test(text)) {
    return err(new Error("The file isn't valid base64: it has characters base64 doesn't use. Send the file's bytes as base64, with nothing else (a data: URL prefix is fine)."));
  }
  return ok(Buffer.from(text, /[-_]/.test(text) ? 'base64url' : 'base64'));
};

export const decodeUpload = <T extends UploadType>(
  dataBase64: string,
  accepted: readonly T[],
  what: string
): Result<DecodedUpload<T>> => {
  const decoded = decodeBase64(dataBase64);
  if (!decoded.ok) return decoded;
  const bytes = decoded.value;
  const type = sniffFileType(bytes);
  if (!type || !(accepted as readonly UploadType[]).includes(type)) {
    return err(new Error(`That isn't ${what} (or the base64 was cut short). Send the whole file, encoded once.`));
  }
  return ok({ bytes, contentType: type as T });
};

/** A doc's source file: what Claude can read to write the doc. */
export interface SourceFile {
  readonly bytes: Buffer;
  /** The extension it's stored under (pdf, png, csv, md…), which decides how it's served. */
  readonly extension: string;
  readonly contentType: string;
}

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

/** The file name's extension, lower case letters and digits only (up to 10), or null. Pure. */
export const safeExtension = (fileName: string | undefined): string | null => {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(fileName?.trim() ?? '');
  return match ? match[1]!.toLowerCase() : null;
};

/** True when the bytes read as UTF-8 text: valid UTF-8 with no NUL bytes (binary formats have them). Pure. */
export const isText = (bytes: Uint8Array): boolean => {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
};

/**
 * Decodes a doc's source file: a PDF or an image (known by their bytes), or any UTF-8 text
 * (Markdown, CSV, JSON, HTML, code…), kept under its own extension (`txt` without one).
 * Claude reads all of these; Word, Excel and other binary files are refused, with what to do.
 */
export const decodeSourceFile = (dataBase64: string, fileName?: string): Result<SourceFile> => {
  const decoded = decodeBase64(dataBase64);
  if (!decoded.ok) return decoded;
  const bytes = decoded.value;
  const type = sniffFileType(bytes);
  if (type === 'application/pdf') return ok({ bytes, extension: 'pdf', contentType: type });
  if (type) return ok({ bytes, extension: IMAGE_EXTENSIONS[type]!, contentType: type });
  if (isText(bytes)) {
    // Text is served as plain text whatever it is, so an HTML or SVG file can't run in the app.
    const extension = safeExtension(fileName) ?? 'txt';
    return ok({ bytes, extension: extension === 'pdf' ? 'txt' : extension, contentType: 'text/plain; charset=utf-8' });
  }
  return err(new Error("That file can't be read: a source must be a PDF, an image (PNG, JPEG, GIF or WebP) or a text file (Markdown, CSV, JSON, HTML…). Save a Word, Excel or other file as PDF or text first."));
};

