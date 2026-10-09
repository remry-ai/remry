// Local-disk object storage under a notebook's files folder.
// Keys are relative paths (e.g. `docs/<id>/source-<uuid>.pdf`); any key that
// resolves outside the files root is rejected.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';

export interface StoredObject {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface StorageClient {
  readonly putObject: (key: string, body: Uint8Array, contentType: string) => Promise<void>;
  readonly readObject: (key: string) => Promise<StoredObject | null>;
  readonly deleteObject: (key: string) => Promise<void>;
  /** Absolute path of `key` on disk, or null for a key outside the files root. */
  readonly pathFor: (key: string) => string | null;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

/** Absolute path for `key` inside `root`, or null if it would escape `root`. */
export const resolveKey = (root: string, key: string): string | null => {
  const base = resolve(root);
  const full = resolve(base, key);
  return full.startsWith(base + sep) ? full : null;
};

export const createStorageClient = (root: string): StorageClient => ({
  putObject: async (key: string, body: Uint8Array): Promise<void> => {
    const path = resolveKey(root, key);
    if (!path) throw new Error(`Invalid storage key: ${key}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  },

  readObject: async (key: string): Promise<StoredObject | null> => {
    const path = resolveKey(root, key);
    if (!path) return null;
    try {
      const bytes = await readFile(path);
      return {
        bytes: new Uint8Array(bytes),
        contentType: CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
      };
    } catch {
      return null;
    }
  },

  deleteObject: async (key: string): Promise<void> => {
    const path = resolveKey(root, key);
    if (!path) return;
    await rm(path, { force: true });
  },

  pathFor: (key: string): string | null => resolveKey(root, key)
});
