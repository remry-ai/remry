// Reads a ZIP archive's files: stored or deflated (what Remry's export writes, and what
// Finder, Windows and `zip` make). No encryption, no ZIP64. Server only (node:zlib).
// Caps the number of files and their total size, so a small archive can't unpack into
// gigabytes.

import { inflateRawSync } from 'node:zlib';
import { ok, err, type Result } from '$shared/utils/result';

export interface UnzippedFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export const ZIP_LIMITS = { files: 2000, totalBytes: 200 * 1024 * 1024 } as const;

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

const findEnd = (view: DataView): number => {
  // The end record is 22 bytes plus a comment of up to 65535.
  const lowest = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let i = view.byteLength - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) === END_SIGNATURE) return i;
  }
  return -1;
};

export const readZip = (data: Uint8Array): Result<readonly UnzippedFile[]> => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const end = data.byteLength >= 22 ? findEnd(view) : -1;
  if (end < 0) return err(new Error("That isn't a .zip file (or it was cut short). Export again, or send the markdown files themselves."));
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  if (count === 0xffff || at === 0xffffffff) return err(new Error('That .zip is too large to read here (ZIP64). Split it into smaller archives.'));
  if (count > ZIP_LIMITS.files) return err(new Error(`That .zip holds ${count} files; import at most ${ZIP_LIMITS.files} at a time.`));

  const decoder = new TextDecoder();
  const files: UnzippedFile[] = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > data.byteLength || view.getUint32(at, true) !== CENTRAL_SIGNATURE) return err(new Error('That .zip is damaged: its file list is broken.'));
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const path = decoder.decode(data.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;

    if (path.endsWith('/')) continue;
    if (flags & 1) return err(new Error(`"${path}" in that .zip is encrypted. Zip the files again without a password.`));
    if (method !== 0 && method !== 8) return err(new Error(`"${path}" in that .zip uses a compression Remry can't read. Zip the files again with the standard method (deflate).`));
    total += size;
    if (total > ZIP_LIMITS.totalBytes) return err(new Error('That .zip unpacks to more than 200 MB. Import it in parts.'));

    if (local + 30 > data.byteLength || view.getUint32(local, true) !== LOCAL_SIGNATURE) return err(new Error(`That .zip is damaged at "${path}".`));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = data.subarray(start, start + compressed);
    if (raw.length !== compressed) return err(new Error(`That .zip is cut short at "${path}".`));
    try {
      const bytes = method === 0 ? raw : new Uint8Array(inflateRawSync(raw, { maxOutputLength: Math.max(size, 1) }));
      files.push({ path, bytes });
    } catch {
      return err(new Error(`"${path}" in that .zip couldn't be unpacked.`));
    }
  }
  return ok(files);
};
